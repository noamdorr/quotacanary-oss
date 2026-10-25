import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Module mocks (hoisted so they run before the route import resolves)
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/refresh-connection", () => ({ refreshConnectionWith: vi.fn() }))
vi.mock("@/lib/alerts/dispatch", () => ({ dispatchAlerts: vi.fn() }))
vi.mock("@/lib/email/client", () => ({ sendEmail: vi.fn() }))

import { dispatchAlerts } from "@/lib/alerts/dispatch"
import { sendEmail } from "@/lib/email/client"
import { refreshConnectionWith } from "@/lib/refresh-connection"
import { createAdminClient } from "@/lib/supabase/admin"
import { POST } from "./route"

const mockAdmin = vi.mocked(createAdminClient)
const mockRefresh = vi.mocked(refreshConnectionWith)
const mockDispatch = vi.mocked(dispatchAlerts)
const mockSendEmail = vi.mocked(sendEmail)

const SECRET = "test-poll-secret"

// Minimal stand-in for the admin client: the route selects connections, reads
// and writes the poll_runs summary, and calls the prune RPC; alert work is
// mocked at dispatchAlerts.
//
// The connections double emulates PostgREST rather than just handing back the
// array: it honours `.gt`/`.order`/`.limit` keyset paging and clamps every
// response to `maxRows`, because the truncation this route has to survive
// happens in the API layer, not in the client.
function rpcResponse(data: unknown, error: unknown = null) {
  const promise = Promise.resolve({ data, error })
  return Object.assign(promise, { abortSignal: () => promise })
}

function fakeSupabase(
  rows = [{ id: "c1", tool_id: "hunter" }],
  options: {
    connectionsError?: { message: string }
    previousRunStartedAt?: string | null
    previousRunOutcome?: "ok" | "degraded" | "failed"
    previousRunError?: { message: string }
    summaryInsertError?: { message: string }
    maxRows?: number
    countOverride?: number
    countError?: { message: string }
  } = {}
) {
  const summaries: Record<string, unknown>[] = []
  const pages: number[] = []
  const maxRows = options.maxRows ?? 1000
  const sorted = [...rows].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )

  function connectionsBuilder() {
    let after: string | null = null
    let limit = Number.POSITIVE_INFINITY
    let head = false
    // biome-ignore lint/suspicious/noExplicitAny: test double for the builder
    const builder: any = {
      select: (_columns: string, opts?: { count?: string; head?: boolean }) => {
        head = opts?.head === true
        return builder
      },
      eq: () => builder,
      gt: (_column: string, value: string) => {
        after = value
        return builder
      },
      order: () => builder,
      limit: (n: number) => {
        limit = n
        return builder
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase builders are thenables.
      then: (resolve: (v: unknown) => unknown) => {
        if (options.connectionsError) {
          return Promise.resolve({
            data: null,
            count: null,
            error: options.connectionsError,
          }).then(resolve)
        }
        if (head) {
          return Promise.resolve({
            data: null,
            count: options.countError
              ? null
              : (options.countOverride ?? sorted.length),
            error: options.countError ?? null,
          }).then(resolve)
        }
        const start = after
          ? sorted.findIndex((r) => r.id > (after as string))
          : 0
        const available = start === -1 ? [] : sorted.slice(start)
        const page = available.slice(0, Math.min(limit, maxRows))
        pages.push(page.length)
        return Promise.resolve({ data: page, count: null, error: null }).then(
          resolve
        )
      },
    }
    return builder
  }
  // biome-ignore lint/suspicious/noExplicitAny: test double for the builder
  const pollRuns: any = {
    select: () => pollRuns,
    eq: vi.fn(() => pollRuns),
    order: () => pollRuns,
    limit: () => pollRuns,
    maybeSingle: async () => ({
      data:
        options.previousRunStartedAt && !options.previousRunError
          ? {
              started_at: options.previousRunStartedAt,
              outcome: options.previousRunOutcome ?? "ok",
            }
          : null,
      error: options.previousRunError ?? null,
    }),
    insert: async (row: Record<string, unknown>) => {
      summaries.push(row)
      return { error: options.summaryInsertError ?? null }
    },
  }
  return {
    from: (table: string) =>
      table === "poll_runs" ? pollRuns : connectionsBuilder(),
    rpc: vi.fn((name: string, _args?: Record<string, unknown>) =>
      rpcResponse(name === "prune_balances" ? 0 : true)
    ),
    previousFilters: pollRuns.eq,
    summaries,
    pages,
  }
}

function pollRequest() {
  return new NextRequest("http://app.quotacanary.com/api/poll", {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  })
}

beforeEach(() => {
  vi.stubEnv("POLL_SECRET", SECRET)
  // biome-ignore lint/suspicious/noExplicitAny: test double
  mockAdmin.mockReturnValue(fakeSupabase() as any)
  // biome-ignore lint/suspicious/noExplicitAny: test double
  mockRefresh.mockResolvedValue({ ok: true } as any)
  mockDispatch.mockResolvedValue({ sent: 0, failedSends: 0, degraded: false })
  mockSendEmail.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("POST /api/poll", () => {
  it("fails the run when the alert delivery loop could not complete", async () => {
    mockDispatch.mockResolvedValue({ sent: 0, failedSends: 0, degraded: true })

    const res = await POST(pollRequest())
    const body = await res.json()

    // The counters alone cannot show this: a dispatch that delivered nothing
    // because it was broken looks identical to a quiet, healthy poll. Answering
    // 5xx is what makes the cron run itself go red (QUO-30).
    expect(res.status).toBe(500)
    expect(body).toMatchObject({ outcome: "failed", alertsDegraded: true })
  })

  it("hands each failed read's stopped-checking evaluation to dispatch (QUO-289)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const stopped = {
      connectionId: "c1",
      userId: "u1",
      toolName: "Hunter",
      connectionName: "Hunter main",
      alertEnabled: true,
      consecutiveFailures: 3,
      keyRejected: false,
      failureAlertedAt: null,
    }
    mockRefresh.mockResolvedValue({
      ok: false,
      error: "Couldn't reach Hunter.",
      stopped,
    })

    await POST(pollRequest())

    expect(mockDispatch).toHaveBeenCalledWith(expect.anything(), [], [stopped])
  })

  it("reports a healthy dispatch as not degraded", async () => {
    const res = await POST(pollRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      alertsSent: 0,
      alertsDegraded: false,
      outcome: "ok",
    })
  })

  it("fails the run when a majority of refreshes failed", async () => {
    // The bug this issue exists for: every balance stale, HTTP 200, monitoring
    // green.
    const db = fakeSupabase([
      { id: "c1", tool_id: "hunter" },
      { id: "c2", tool_id: "ahrefs" },
    ])
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockResolvedValue({ ok: false, error: "vendor down" })

    const res = await POST(pollRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toMatchObject({ outcome: "failed", ok: 0, failed: 2 })
  })

  it("keeps a single flaky vendor at 200 so the alarm stays meaningful", async () => {
    const db = fakeSupabase([
      { id: "c1", tool_id: "hunter" },
      { id: "c2", tool_id: "ahrefs" },
      { id: "c3", tool_id: "tomba" },
    ])
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockImplementation(async (_supabase, id) =>
      id === "c2"
        ? { ok: false, error: "vendor timed out" }
        : // biome-ignore lint/suspicious/noExplicitAny: test double
          ({ ok: true } as any)
    )

    const res = await POST(pollRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ outcome: "degraded", ok: 2, failed: 1 })
  })

  it("persists a run summary carrying metrics and no identifiers", async () => {
    const db = fakeSupabase()
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)

    await POST(pollRequest())

    expect(db.summaries).toHaveLength(1)
    const summary = db.summaries[0]
    expect(summary).toMatchObject({
      outcome: "ok",
      connections_polled: 1,
      refresh_ok: 1,
      refresh_failed: 0,
      alerts_degraded: false,
      missed_runs: 0,
    })
    // A summary row is queryable telemetry, so it must never carry who was
    // polled or what a vendor said.
    expect(JSON.stringify(summary)).not.toContain("c1")
    expect(JSON.stringify(summary)).not.toContain("hunter")
  })

  it("records a failed summary when the connections query itself fails", async () => {
    // The earliest exit is also the most alarming one, and it used to leave no
    // trace beyond a log line.
    const db = fakeSupabase([], { connectionsError: { message: "boom" } })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await POST(pollRequest())

    expect(res.status).toBe(500)
    expect(db.summaries[0]).toMatchObject({ outcome: "failed" })
  })

  it("counts the scheduled runs a paused cron swallowed", async () => {
    const db = fakeSupabase([{ id: "c1", tool_id: "hunter" }], {
      previousRunStartedAt: new Date(Date.now() - 121 * 60_000).toISOString(),
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const body = await (await POST(pollRequest())).json()

    // 121 minutes at a 15-minute cadence: seven slots went by unfired before
    // this run. Nothing else in the system notices a schedule that stopped.
    expect(body.missedRuns).toBe(7)
    expect(db.summaries[0]).toMatchObject({ missed_runs: 7 })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("missed 7 scheduled run(s)")
    )
    logSpy.mockRestore()
  })

  it("polls normally on an instance whose poll history is unreadable", async () => {
    // An instance that has not run migration 053 yet has no poll_runs table, so
    // both the lookup and the insert fail. That must cost telemetry only: the
    // deploy lands before the migration is applied.
    const db = fakeSupabase([{ id: "c1", tool_id: "hunter" }], {
      previousRunError: { message: "relation poll_runs does not exist" },
      summaryInsertError: { message: "relation poll_runs does not exist" },
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await POST(pollRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    // No history read as no history, never as a missed run: a false alarm here
    // would fire on every poll until the migration lands.
    expect(body).toMatchObject({ outcome: "ok", ok: 1, missedRuns: 0 })
    logSpy.mockRestore()
  })

  it("still answers when the run summary cannot be written", async () => {
    // Telemetry must never be able to fail the poll it is describing.
    const db = fakeSupabase([{ id: "c1", tool_id: "hunter" }], {
      summaryInsertError: { message: "relation poll_runs does not exist" },
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const res = await POST(pollRequest())

    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe("ok")
    logSpy.mockRestore()
  })

  it("names the failing connection in the server log", async () => {
    // The response counters say failed: 1 but not WHO - the id only exists
    // server-side. Without this log an intermittent vendor failure is
    // unattributable (the status flap on the row heals on the next poll).
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const db = fakeSupabase([
      { id: "c1", tool_id: "hunter" },
      { id: "c2", tool_id: "ahrefs" },
    ])
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    mockRefresh.mockImplementation(async (_supabase, id) => {
      if (id === "c2") return { ok: false, error: "vendor timed out" }
      // biome-ignore lint/suspicious/noExplicitAny: test double
      return { ok: true } as any
    })

    const res = await POST(pollRequest())
    const body = await res.json()

    expect(body).toMatchObject({ ok: 1, failed: 1 })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("ahrefs c2"),
      "vendor timed out"
    )
    logSpy.mockRestore()
  })

  it("names a connection whose refresh threw, with the thrown reason", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const boom = new Error("connect ETIMEDOUT")
    mockRefresh.mockRejectedValue(boom)

    const res = await POST(pollRequest())
    const body = await res.json()

    expect(body).toMatchObject({ ok: 0, failed: 1 })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("hunter c1"),
      boom
    )
    logSpy.mockRestore()
  })

  it("polls every connection past the PostgREST row cap", async () => {
    // The bug: an unpaginated select stops at max_rows, so connections past the
    // ceiling are never refreshed, never alerted on, and the run still reports
    // success. maxRows is 2 here for legibility - the real ceiling is 1000.
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i + 1}`,
      tool_id: "hunter",
    }))
    const db = fakeSupabase(rows, { maxRows: 2 })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)

    const body = await (await POST(pollRequest())).json()

    expect(body).toMatchObject({ outcome: "ok", polled: 5, ok: 5 })
    expect(mockRefresh).toHaveBeenCalledTimes(5)
    // 2 + 2 + 1 + 0: the loop stops on an EMPTY page, never on a short one, so
    // a host whose max_rows is below our page size still cannot truncate it.
    expect(db.pages).toEqual([2, 2, 1, 0])
  })

  it("refreshes each connection exactly once across page boundaries", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i + 1}`,
      tool_id: "hunter",
    }))
    const db = fakeSupabase(rows, { maxRows: 2 })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)

    await POST(pollRequest())

    // Keyset paging must not re-serve a row it already handed out: a duplicate
    // would double-spend a vendor's rate limit and could double-fire an alert.
    const polled = mockRefresh.mock.calls.map(([, id]) => id)
    expect([...polled].sort()).toEqual(["c1", "c2", "c3", "c4", "c5"])
  })

  it("logs loudly when the fetched count disagrees with the exact count", async () => {
    // The tripwire: whatever future ceiling appears, it can never again be
    // silent. The run itself still completes with what it did fetch.
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const db = fakeSupabase([{ id: "c1", tool_id: "hunter" }], {
      countOverride: 7,
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)

    const body = await (await POST(pollRequest())).json()

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("fetched 1 of 7")
    )
    expect(body).toMatchObject({ outcome: "ok", polled: 1 })
    logSpy.mockRestore()
  })

  it("polls normally when the count probe itself fails", async () => {
    // The probe is diagnostics. It must never be able to fail the poll.
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const db = fakeSupabase([{ id: "c1", tool_id: "hunter" }], {
      countError: { message: "count timed out" },
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)

    const res = await POST(pollRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ outcome: "ok", polled: 1 })
    logSpy.mockRestore()
  })

  it("rejects a request without the poll secret", async () => {
    const res = await POST(
      new NextRequest("http://app.quotacanary.com/api/poll", { method: "POST" })
    )

    expect(res.status).toBe(401)
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})

// QUO-77: the two alarms. Both are opt-in, both are best-effort, and neither
// may change the outcome of the run it describes.
describe("POST /api/poll alarms", () => {
  const HEARTBEAT = "https://hc-ping.example/deadbeef"
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response("OK", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // One of these three failing stays under POLL_FAILURE_THRESHOLD, which is
  // what makes a run degraded rather than failed.
  const FLAKY_ROWS = [
    { id: "c1", tool_id: "hunter" },
    { id: "c2", tool_id: "ahrefs" },
    { id: "c3", tool_id: "tomba" },
  ]

  function twoConnections() {
    const db = fakeSupabase([
      { id: "c1", tool_id: "hunter" },
      { id: "c2", tool_id: "ahrefs" },
    ])
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(db as any)
    return db
  }

  it("pings the monitor on a healthy run", async () => {
    vi.stubEnv("POLL_HEARTBEAT_URL", HEARTBEAT)

    await POST(pollRequest())

    expect(fetchMock).toHaveBeenCalledWith(
      HEARTBEAT,
      expect.objectContaining({ method: "POST" })
    )
  })

  it("fails the check on a failed run, so the monitor alarms now", async () => {
    vi.stubEnv("POLL_HEARTBEAT_URL", HEARTBEAT)
    twoConnections()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockResolvedValue({ ok: false, error: "vendor down" })

    await POST(pollRequest())

    expect(fetchMock).toHaveBeenCalledWith(
      `${HEARTBEAT}/fail`,
      expect.anything()
    )
  })

  it("still pings success on a degraded run, so one flaky vendor cannot page", async () => {
    vi.stubEnv("POLL_HEARTBEAT_URL", HEARTBEAT)
    // Three connections, one failing: under the failure threshold, so degraded.
    const flaky = fakeSupabase(FLAKY_ROWS)
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(flaky as any)
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockImplementation(async (_supabase, id) =>
      id === "c2"
        ? { ok: false, error: "vendor timed out" }
        : // biome-ignore lint/suspicious/noExplicitAny: test double
          ({ ok: true } as any)
    )

    await POST(pollRequest())

    expect(fetchMock).toHaveBeenCalledWith(HEARTBEAT, expect.anything())
  })

  it("does not double the slash when the configured URL ends in one", async () => {
    vi.stubEnv("POLL_HEARTBEAT_URL", `${HEARTBEAT}/`)
    twoConnections()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockResolvedValue({ ok: false, error: "vendor down" })

    await POST(pollRequest())

    expect(fetchMock).toHaveBeenCalledWith(
      `${HEARTBEAT}/fail`,
      expect.anything()
    )
  })

  it("carries the run's counts in the ping and no identifiers", async () => {
    vi.stubEnv("POLL_HEARTBEAT_URL", HEARTBEAT)
    twoConnections()

    await POST(pollRequest())

    const body = fetchMock.mock.calls[0][1].body as string
    expect(JSON.parse(body)).toMatchObject({
      outcome: "ok",
      connections_polled: 2,
      refresh_ok: 2,
    })
    expect(body).not.toContain("c1")
    expect(body).not.toContain("hunter")
  })

  it("says nothing when no monitor is configured", async () => {
    await POST(pollRequest())

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps the run's own outcome when the monitor is unreachable", async () => {
    // The alarm describes the run; it must never be able to change it.
    vi.stubEnv("POLL_HEARTBEAT_URL", HEARTBEAT)
    vi.spyOn(console, "error").mockImplementation(() => {})
    fetchMock.mockRejectedValue(new Error("monitor down"))

    const res = await POST(pollRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ outcome: "ok" })
  })

  it("emails the operator when the run failed", async () => {
    vi.stubEnv("POLL_ALERT_EMAIL", "ops@example.com")
    twoConnections()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockResolvedValue({ ok: false, error: "vendor down" })

    await POST(pollRequest())

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ops@example.com",
        subject: "[QuotaCanary] Poll run failed",
        tag: "poll-alarm",
      })
    )
  })

  it("stays out of the inbox on a healthy run", async () => {
    vi.stubEnv("POLL_ALERT_EMAIL", "ops@example.com")

    await POST(pollRequest())

    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("stays out of the inbox for one degraded run, and writes on the second", async () => {
    vi.stubEnv("POLL_ALERT_EMAIL", "ops@example.com")
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockImplementation(async (_supabase, id) =>
      id === "c2"
        ? { ok: false, error: "vendor timed out" }
        : // biome-ignore lint/suspicious/noExplicitAny: test double
          ({ ok: true } as any)
    )

    const recent = new Date(Date.now() - 15 * 60_000).toISOString()
    const afterHealthy = fakeSupabase(FLAKY_ROWS, {
      previousRunStartedAt: recent,
      previousRunOutcome: "ok",
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(afterHealthy as any)
    await POST(pollRequest())
    expect(mockSendEmail).not.toHaveBeenCalled()

    const afterDegraded = fakeSupabase(FLAKY_ROWS, {
      previousRunStartedAt: recent,
      previousRunOutcome: "degraded",
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(afterDegraded as any)
    await POST(pollRequest())

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "[QuotaCanary] Poll run degraded" })
    )
  })

  it("emails when the schedule swallowed runs", async () => {
    vi.stubEnv("POLL_ALERT_EMAIL", "ops@example.com")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const afterGap = fakeSupabase([{ id: "c1", tool_id: "hunter" }], {
      previousRunStartedAt: new Date(Date.now() - 121 * 60_000).toISOString(),
    })
    // biome-ignore lint/suspicious/noExplicitAny: test double
    mockAdmin.mockReturnValue(afterGap as any)

    await POST(pollRequest())

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[QuotaCanary] Poll schedule missed 7 runs",
      })
    )
  })

  it("sends nowhere when no operator address is configured", async () => {
    twoConnections()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockRefresh.mockResolvedValue({ ok: false, error: "vendor down" })

    await POST(pollRequest())

    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it("keeps the run's own outcome when the alarm email fails", async () => {
    vi.stubEnv("POLL_ALERT_EMAIL", "ops@example.com")
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockSendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 500",
      retryable: true,
    })
    twoConnections()
    mockRefresh.mockResolvedValue({ ok: false, error: "vendor down" })

    const res = await POST(pollRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ outcome: "failed" })
  })
})

describe("poll overlap guard", () => {
  it("skips a second invocation before vendor/alert work and allows a later run", async () => {
    const db = fakeSupabase()
    let owner: unknown = null
    db.rpc.mockImplementation((name, args) => {
      if (name === "claim_poll_run") {
        if (owner) return rpcResponse(false)
        owner = args?.p_owner_id
        return rpcResponse(true)
      }
      if (name === "release_poll_run") {
        if (owner === args?.p_owner_id) owner = null
        return rpcResponse(true)
      }
      return rpcResponse(
        name === "prune_balances" ? 0 : owner === args?.p_owner_id
      )
    })
    mockAdmin.mockReturnValue(db as never)
    let finish: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      finish = resolve
    })
    mockRefresh.mockImplementationOnce(async () => {
      await blocked
      return { ok: true, balances: [] }
    })
    const first = POST(pollRequest())
    await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1))
    const second = await POST(pollRequest())
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({
      outcome: "skipped",
      reason: "overlap",
    })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(db.summaries[0]).toMatchObject({
      skipped_overlap: true,
      connections_polled: 0,
    })
    finish()
    expect((await first).status).toBe(200)
    expect(owner).toBeNull()
    expect((await POST(pollRequest())).status).toBe(200)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
    expect(db.previousFilters).toHaveBeenCalledWith("skipped_overlap", false)
  })

  it("fails closed before vendor calls when the lease RPC is unavailable", async () => {
    const db = fakeSupabase()
    db.rpc.mockReturnValue(rpcResponse(null, { message: "missing RPC" }))
    mockAdmin.mockReturnValue(db as never)
    const res = await POST(pollRequest())
    expect(res.status).toBe(503)
    expect(mockRefresh).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(db.summaries[0].outcome).toBe("failed")
  })

  it("stops before the next batch and alerts if lease ownership is lost", async () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      id: `c${i}`,
      tool_id: "hunter",
    }))
    const db = fakeSupabase(rows)
    let renewals = 0
    db.rpc.mockImplementation((name) =>
      rpcResponse(name === "renew_poll_run" ? ++renewals < 3 : true)
    )
    mockAdmin.mockReturnValue(db as never)
    const res = await POST(pollRequest())
    expect(res.status).toBe(503)
    expect(mockRefresh).toHaveBeenCalledTimes(8)
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(db.summaries[0]).toMatchObject({
      outcome: "failed",
      connections_polled: 8,
      refresh_ok: 8,
    })
    expect(db.rpc.mock.calls.at(-1)?.[0]).toBe("release_poll_run")
  })

  it("releases its lease on the existing query-error early return", async () => {
    const db = fakeSupabase([], {
      connectionsError: { message: "query failed" },
    })
    mockAdmin.mockReturnValue(db as never)
    expect((await POST(pollRequest())).status).toBe(500)
    expect(db.rpc.mock.calls.at(-1)?.[0]).toBe("release_poll_run")
  })
})
