import { encrypt } from "@/lib/crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AlertEvaluation } from "./severity"

// Capture the model handed to the email renderer so we can assert which pools
// land in the email body. sendEmail defaults to success; individual tests
// override it to simulate Postmark failures.
const sendEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true as const }))
const renderAlertEmail = vi.fn((_model: unknown) => ({
  subject: "s",
  html: "<p>h</p>",
  text: "h",
}))

vi.mock("@/lib/email/client", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}))
vi.mock("@/lib/email/render/alert", () => ({
  renderAlertEmail: (model: unknown) => renderAlertEmail(model),
}))

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock("node:dns/promises", () => ({ lookup }))

// ---------------------------------------------------------------------------
// Stateful in-memory Supabase fake. The query-builder side implements the
// chains dispatch uses; the rpc side mirrors the semantics of migration 048's
// claim_due_alert_deliveries / record_alert_delivery_result functions.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>

let idCounter = 0
const uid = (prefix: string) => `${prefix}-${++idCounter}`

const T0 = "2026-06-01T00:00:00.000Z"

function rankOf(level: unknown): number {
  if (level === "critical") return 2
  if (level === "low") return 1
  return 0
}

function fakeDb(seed: {
  users?: Row[]
  connections?: Row[]
  destinations?: Row[]
}) {
  const tables: Record<string, Row[]> = {
    users: seed.users ?? [],
    connections: seed.connections ?? [],
    alert_events: [],
    alert_destinations: seed.destinations ?? [],
    alert_deliveries: [],
  }

  type Filter = { op: "eq" | "in" | "is"; col: string; value: unknown }
  const matches = (row: Row, filters: Filter[]) =>
    filters.every((f) => {
      if (f.op === "in") return (f.value as unknown[]).includes(row[f.col])
      return row[f.col] === f.value
    })

  function builder(table: string) {
    const state = {
      filters: [] as Filter[],
      action: "select" as "select" | "insert" | "update" | "upsert",
      payload: null as unknown,
      single: false,
      maybeSingle: false,
    }
    function execute() {
      const rows = tables[table]
      if (state.action === "insert") {
        const record: Row = { ...(state.payload as Row) }
        record.id = record.id ?? uid("row")
        record.created_at = record.created_at ?? new Date().toISOString()
        if (table === "alert_events") {
          record.delivery_satisfied_at = record.delivery_satisfied_at ?? null
          record.delivery_canceled_at = record.delivery_canceled_at ?? null
          // Partial unique index: one active event per (connection_id, level).
          const clash = rows.find(
            (r) =>
              r.connection_id === record.connection_id &&
              r.level === record.level &&
              r.delivery_satisfied_at === null &&
              r.delivery_canceled_at === null
          )
          if (clash) {
            return { data: null, error: { code: "23505", message: "dup" } }
          }
        }
        rows.push(record)
        return state.single
          ? { data: record, error: null }
          : { data: [record], error: null }
      }
      if (state.action === "upsert") {
        const payloadRows = (
          Array.isArray(state.payload) ? state.payload : [state.payload]
        ) as Row[]
        for (const p of payloadRows) {
          const existing = rows.find(
            (r) =>
              r.event_id === p.event_id && r.delivery_key === p.delivery_key
          )
          if (existing) continue // ignoreDuplicates: true
          rows.push({
            id: uid("del"),
            destination_id: null,
            status: "pending",
            attempt_count: 0,
            next_attempt_at: new Date().toISOString(),
            last_attempt_at: null,
            last_error: null,
            succeeded_at: null,
            claimed_until: null,
            claim_token: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...p,
          })
        }
        return { data: null, error: null }
      }
      if (state.action === "update") {
        for (const r of rows.filter((r) => matches(r, state.filters))) {
          Object.assign(r, state.payload)
        }
        return { data: null, error: null }
      }
      const matched = rows
        .filter((r) => matches(r, state.filters))
        .map((r) => ({ ...r }))
      if (state.single) {
        return matched[0]
          ? { data: matched[0], error: null }
          : { data: null, error: { message: "not found" } }
      }
      if (state.maybeSingle) return { data: matched[0] ?? null, error: null }
      return { data: matched, error: null }
    }
    // biome-ignore lint/suspicious/noExplicitAny: test double for the builder
    const api: any = {
      select: () => api,
      insert: (payload: unknown) => {
        state.action = "insert"
        state.payload = payload
        return api
      },
      upsert: (payload: unknown) => {
        state.action = "upsert"
        state.payload = payload
        return api
      },
      update: (payload: unknown) => {
        state.action = "update"
        state.payload = payload
        return api
      },
      eq: (col: string, value: unknown) => {
        state.filters.push({ op: "eq", col, value })
        return api
      },
      in: (col: string, value: unknown[]) => {
        state.filters.push({ op: "in", col, value })
        return api
      },
      is: (col: string, value: unknown) => {
        state.filters.push({ op: "is", col, value })
        return api
      },
      single: () => {
        state.single = true
        return api
      },
      maybeSingle: () => {
        state.maybeSingle = true
        return api
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase builders are thenables; the fake must be awaitable the same way.
      then: (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown
      ) => Promise.resolve(execute()).then(resolve, reject),
    }
    return api
  }

  // Mirrors claim_due_alert_deliveries (migration 048).
  function claim(batchSize: number): Row[] {
    const now = Date.now()
    const due = tables.alert_deliveries
      .filter((d) => {
        if (d.claimed_until && Date.parse(d.claimed_until as string) >= now) {
          return false
        }
        const event = tables.alert_events.find((e) => e.id === d.event_id)
        if (!event) return false
        const dest = d.destination_id
          ? tables.alert_destinations.find((x) => x.id === d.destination_id)
          : null
        const user = tables.users.find((u) => u.id === event.user_id)
        if (d.status === "pending") {
          if (Date.parse(d.next_attempt_at as string) > now) return false
          return (
            d.channel === "email" || (dest != null && dest.is_enabled !== false)
          )
        }
        if (d.status === "paused") {
          if (d.channel === "email") {
            return (
              user != null &&
              Date.parse(user.updated_at as string) >
                Date.parse(d.target_updated_at as string)
            )
          }
          return (
            dest != null &&
            dest.is_enabled !== false &&
            Date.parse(dest.updated_at as string) >
              Date.parse(d.target_updated_at as string)
          )
        }
        return false
      })
      .sort(
        (a, b) =>
          Date.parse(a.next_attempt_at as string) -
          Date.parse(b.next_attempt_at as string)
      )
      .slice(0, batchSize)
    const claimed: Row[] = []
    for (const d of due) {
      const event = tables.alert_events.find((e) => e.id === d.event_id)
      const dest = d.destination_id
        ? tables.alert_destinations.find((x) => x.id === d.destination_id)
        : null
      const user = tables.users.find((u) => u.id === event?.user_id)
      d.status = "pending"
      d.claim_token = uid("tok")
      d.claimed_until = new Date(now + 5 * 60_000).toISOString()
      d.target_updated_at =
        (d.channel === "email" ? user?.updated_at : dest?.updated_at) ??
        d.target_updated_at
      d.updated_at = new Date(now).toISOString()
      claimed.push({ ...d })
    }
    return claimed
  }

  // Mirrors record_alert_delivery_result (migration 048).
  function record(args: {
    p_delivery_id: string
    p_claim_token: string
    p_outcome: string
    p_error?: string | null
    p_next_attempt_at?: string | null
  }): boolean {
    const d = tables.alert_deliveries.find(
      (x) =>
        x.id === args.p_delivery_id &&
        x.claim_token === args.p_claim_token &&
        x.status === "pending"
    )
    if (!d) return false
    const nowIso = new Date().toISOString()
    d.attempt_count = (d.attempt_count as number) + 1
    d.last_attempt_at = nowIso
    d.claim_token = null
    d.claimed_until = null
    d.updated_at = nowIso
    if (args.p_outcome === "succeeded") {
      d.status = "succeeded"
      d.succeeded_at = nowIso
      d.last_error = null
      const event = tables.alert_events.find((e) => e.id === d.event_id)
      if (
        event &&
        !event.delivery_canceled_at &&
        !event.delivery_satisfied_at
      ) {
        event.delivery_satisfied_at = nowIso
        const conn = tables.connections.find(
          (c) => c.id === event.connection_id
        )
        if (conn && rankOf(conn.notified_level) < rankOf(event.level)) {
          conn.notified_level = event.level
          if (event.level === "critical") conn.alert_fired_at = nowIso
        }
      }
    } else if (args.p_outcome === "retry") {
      d.status = "pending"
      d.last_error = args.p_error ?? null
      d.next_attempt_at =
        args.p_next_attempt_at ??
        new Date(Date.now() + 15 * 60_000).toISOString()
    } else {
      d.status = "paused"
      d.last_error = args.p_error ?? null
    }
    return true
  }

  async function rpc(fn: string, args: Record<string, unknown>) {
    if (fn === "claim_due_alert_deliveries") {
      return { data: claim(args.batch_size as number), error: null }
    }
    if (fn === "record_alert_delivery_result") {
      // biome-ignore lint/suspicious/noExplicitAny: test double
      return { data: record(args as any), error: null }
    }
    return { data: null, error: { message: `unknown rpc ${fn}` } }
  }

  const client = {
    from: (name: string) => builder(name),
    rpc,
  } as unknown as SupabaseClient

  return { client, tables, claim, record }
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seededDb(opts: { notifyMode?: string; destinations?: Row[] } = {}) {
  return fakeDb({
    users: [
      {
        id: "u1",
        email: "a@b.com",
        notify_mode: opts.notifyMode ?? "low_and_critical",
        updated_at: T0,
      },
    ],
    connections: [{ id: "c1", notified_level: "none", alert_fired_at: null }],
    destinations: opts.destinations ?? [],
  })
}

function webhookDestination(overrides: Row = {}): Row {
  return {
    id: "dest-1",
    user_id: "u1",
    kind: "webhook",
    name: "Hook",
    min_level: "low",
    is_enabled: true,
    encrypted_url: encrypt("https://example.com/hook"),
    consecutive_failures: 0,
    updated_at: T0,
    ...overrides,
  }
}

function evaluation(
  balance: number,
  low: number,
  overrides: Partial<AlertEvaluation> = {}
): AlertEvaluation {
  return {
    connectionId: "c1",
    userId: "u1",
    toolName: "Acme",
    connectionName: "Acme main",
    topupUrl: null,
    alertEnabled: true,
    severity: "low",
    notifiedLevel: "none",
    pools: [
      { label: "Credits", balance, low, critical: null, unit: "credits" },
    ],
    ...overrides,
  }
}

function stubWebhookResponse(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("x", { status }))
  )
}

async function run(
  db: ReturnType<typeof fakeDb>,
  evaluations: AlertEvaluation[]
) {
  const { dispatchAlerts } = await import("./dispatch")
  return dispatchAlerts(db.client, evaluations)
}

beforeEach(() => {
  vi.stubEnv("POSTMARK_SERVER_TOKEN", "tok")
  vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
  stubWebhookResponse(200)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Pool body filtering (pre-existing behavior, unchanged by QUO-5)
// ---------------------------------------------------------------------------

describe("dispatchAlerts pool-body filter", () => {
  it("includes a pool whose balance sits exactly on its threshold", async () => {
    const db = seededDb()
    const res = await run(db, [evaluation(50, 50)])

    expect(res.sent).toBe(1)
    expect(renderAlertEmail).toHaveBeenCalledOnce()
    const model = renderAlertEmail.mock.calls[0][0] as {
      pools: { label: string; balance: number; threshold: number }[]
    }
    expect(model.pools).toHaveLength(1)
    expect(model.pools[0]).toMatchObject({
      label: "Credits",
      balance: 50,
      threshold: 50,
    })
  })

  it("excludes a pool whose balance is strictly above its threshold", async () => {
    const db = seededDb()
    const res = await run(db, [evaluation(60, 50)])

    expect(res.sent).toBe(1)
    const model = renderAlertEmail.mock.calls[0][0] as { pools: unknown[] }
    expect(model.pools).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Retry-safe delivery (QUO-5)
// ---------------------------------------------------------------------------

describe("dispatchAlerts retry-safe delivery", () => {
  it("creates an in-app alert event when a connection escalates", async () => {
    const db = seededDb()
    await run(db, [evaluation(50, 50)])

    expect(db.tables.alert_events).toHaveLength(1)
    expect(db.tables.alert_events[0]).toMatchObject({
      user_id: "u1",
      connection_id: "c1",
      level: "low",
      tool_name: "Acme",
      connection_name: "Acme main",
    })
  })

  it("posts matching alert events to configured webhook destinations with an idempotency key", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    await run(db, [evaluation(50, 50)])

    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("quota.alert.low"),
      })
    )
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const deliveryId = (opts.headers as Record<string, string>)[
      "idempotency-key"
    ]
    expect(db.tables.alert_deliveries.map((d) => d.id)).toContain(deliveryId)
  })

  it("keeps the high-water mark unarmed and schedules retries when every channel fails", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(500)

    const res = await run(db, [evaluation(50, 50)])

    expect(db.tables.alert_events).toHaveLength(1)
    expect(db.tables.alert_events[0].delivery_satisfied_at).toBeNull()
    expect(db.tables.connections[0].notified_level).toBe("none")
    expect(res.failedSends).toBe(2)

    const deliveries = db.tables.alert_deliveries
    expect(deliveries).toHaveLength(2)
    for (const d of deliveries) {
      expect(d.status).toBe("pending")
      expect(d.attempt_count).toBe(1)
      // First retry lands ~15 minutes out.
      const delayMs = Date.parse(d.next_attempt_at as string) - Date.now()
      expect(delayMs).toBeGreaterThan(14 * 60_000)
      expect(delayMs).toBeLessThan(16 * 60_000)
    }
  })

  it("advances the high-water mark once on partial success and keeps the failed channel pending", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(200)

    const res = await run(db, [evaluation(50, 50)])

    expect(db.tables.alert_events[0].delivery_satisfied_at).not.toBeNull()
    expect(db.tables.connections[0].notified_level).toBe("low")
    expect(res.sent).toBe(1)
    expect(res.failedSends).toBe(1)

    const byKey = new Map(
      db.tables.alert_deliveries.map((d) => [d.delivery_key, d])
    )
    expect(byKey.get("destination:dest-1")?.status).toBe("succeeded")
    expect(byKey.get("email")?.status).toBe("pending")
  })

  it("reuses the active event on a later poll and retries only due failed deliveries", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])

    // Second poll while nothing is due: the event is reused, nothing resends.
    sendEmail.mockClear()
    vi.mocked(fetch).mockClear()
    await run(db, [evaluation(50, 50)])
    expect(db.tables.alert_events).toHaveLength(1)
    expect(db.tables.alert_deliveries).toHaveLength(2)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()

    // Age only the email delivery; the next poll retries just that one.
    sendEmail.mockResolvedValue({ ok: true } as never)
    const email = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "email"
    )
    if (!email) throw new Error("missing email delivery")
    email.next_attempt_at = new Date(Date.now() - 60_000).toISOString()

    await run(db, [evaluation(50, 50)])
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
    expect(email.status).toBe("succeeded")
    expect(db.tables.alert_events[0].delivery_satisfied_at).not.toBeNull()
    expect(db.tables.connections[0].notified_level).toBe("low")
  })

  it("never resends a channel that already succeeded", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(200)
    await run(db, [evaluation(50, 50)])

    // Age the failed email delivery and poll again with the (now satisfied)
    // connection: only the email goes out, the webhook is never re-posted.
    sendEmail.mockResolvedValue({ ok: true } as never)
    vi.mocked(fetch).mockClear()
    const email = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "email"
    )
    if (!email) throw new Error("missing email delivery")
    email.next_attempt_at = new Date(Date.now() - 60_000).toISOString()

    await run(db, [evaluation(50, 50, { notifiedLevel: "low" })])

    expect(fetch).not.toHaveBeenCalled()
    expect(email.status).toBe("succeeded")
    expect(
      db.tables.alert_deliveries.find(
        (d) => d.delivery_key === "destination:dest-1"
      )?.attempt_count
    ).toBe(1)
  })

  it("satisfies the event through the in-app record when no external channel is configured", async () => {
    const db = seededDb({ notifyMode: "off" })

    const res = await run(db, [evaluation(50, 50)])

    expect(db.tables.alert_events).toHaveLength(1)
    expect(db.tables.alert_events[0].delivery_satisfied_at).not.toBeNull()
    expect(db.tables.connections[0].notified_level).toBe("low")
    expect(db.tables.alert_deliveries).toHaveLength(0)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
    expect(res.failedSends).toBe(0)
  })

  it("cancels pending low deliveries when a critical escalation supersedes them", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])
    const lowEvent = db.tables.alert_events[0]

    // Balance drops through the critical threshold before any retry succeeds.
    sendEmail.mockResolvedValue({ ok: true } as never)
    stubWebhookResponse(200)
    await run(db, [
      evaluation(5, 50, {
        severity: "critical",
        pools: [
          { label: "Credits", balance: 5, low: 50, critical: 10, unit: null },
        ],
      }),
    ])

    expect(lowEvent.delivery_canceled_at).not.toBeNull()
    const lowDeliveries = db.tables.alert_deliveries.filter(
      (d) => d.event_id === lowEvent.id
    )
    expect(lowDeliveries).toHaveLength(2)
    for (const d of lowDeliveries) expect(d.status).toBe("canceled")

    const criticalEvent = db.tables.alert_events.find(
      (e) => e.level === "critical"
    )
    expect(criticalEvent?.delivery_satisfied_at).not.toBeNull()
    expect(db.tables.connections[0].notified_level).toBe("critical")
    expect(db.tables.connections[0].alert_fired_at).not.toBeNull()
  })

  it("cancels pending deliveries, closes unsatisfied events, and re-arms on recovery", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])

    // The balance recovers before any retry succeeds. Even though the
    // high-water mark never advanced, the stale deliveries must die.
    await run(db, [evaluation(500, 50, { severity: "healthy" })])

    expect(db.tables.alert_events[0].delivery_canceled_at).not.toBeNull()
    for (const d of db.tables.alert_deliveries) {
      expect(d.status).toBe("canceled")
    }
    expect(db.tables.connections[0].notified_level).toBe("none")

    // Nothing is claimable after recovery.
    expect(db.claim(50)).toHaveLength(0)
  })

  it("re-arms an advanced high-water mark and cancels a satisfied event's failed channels on recovery", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(200)
    await run(db, [evaluation(50, 50)]) // webhook ok, email pending retry

    await run(db, [
      evaluation(500, 50, { severity: "healthy", notifiedLevel: "low" }),
    ])

    expect(db.tables.connections[0].notified_level).toBe("none")
    expect(db.tables.connections[0].alert_fired_at).toBeNull()
    const email = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "email"
    )
    expect(email?.status).toBe("canceled")
  })

  it("rejects a late result from a canceled claim so it cannot advance connection state", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])

    // A poller claims the due deliveries...
    for (const d of db.tables.alert_deliveries) {
      d.next_attempt_at = new Date(Date.now() - 60_000).toISOString()
    }
    const claimed = db.claim(50)
    expect(claimed.length).toBeGreaterThan(0)

    // ...then recovery cancels everything while the request is in flight.
    await run(db, [evaluation(500, 50, { severity: "healthy" })])

    // The late success is rejected: no state may advance.
    for (const c of claimed) {
      const accepted = db.record({
        p_delivery_id: c.id as string,
        p_claim_token: c.claim_token as string,
        p_outcome: "succeeded",
      })
      expect(accepted).toBe(false)
    }
    expect(db.tables.alert_events[0].delivery_satisfied_at).toBeNull()
    expect(db.tables.connections[0].notified_level).toBe("none")
  })

  it("pauses a delivery on a non-retryable failure instead of rescheduling it", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({ ok: true } as never)
    stubWebhookResponse(404)

    await run(db, [evaluation(50, 50)])

    const hook = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "destination:dest-1"
    )
    expect(hook?.status).toBe("paused")
    expect(hook?.last_error).toBe("HTTP 404")
    // Destination health fields stay authoritative for the settings UI.
    expect(db.tables.alert_destinations[0].last_error).toBe("HTTP 404")
    expect(db.tables.alert_destinations[0].consecutive_failures).toBe(1)
  })
})

// A query builder whose chain resolves to a Supabase error, the way the real
// client reports a failed select (data: null alongside the error).
function failingBuilder(error: { message: string }) {
  // biome-ignore lint/suspicious/noExplicitAny: test double for the builder
  const api: any = {
    select: () => api,
    insert: () => api,
    upsert: () => api,
    update: () => api,
    eq: () => api,
    in: () => api,
    is: () => api,
    single: () => api,
    maybeSingle: () => api,
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are thenables; the fake must be awaitable the same way.
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error }).then(resolve),
  }
  return api
}

// Wrap a fake db so one rpc or one table fails, simulating a transient
// database error partway through a poll. `times` bounds how many queries
// against the table fail, so a test can model one bad second rather than a
// table that is down for the whole poll - the two have different blast radii.
function withFailure(
  db: ReturnType<typeof fakeDb>,
  failure: { rpc?: string; table?: string; times?: number }
) {
  const error = { message: "transient database failure" }
  let remaining = failure.times ?? Number.POSITIVE_INFINITY
  const base = db.client as unknown as {
    from: (name: string) => unknown
    rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>
  }
  return {
    from: (name: string) => {
      if (name !== failure.table || remaining <= 0) return base.from(name)
      remaining--
      return failingBuilder(error)
    },
    rpc: async (fn: string, args: Record<string, unknown>) =>
      fn === failure.rpc ? { data: null, error } : base.rpc(fn, args),
  } as unknown as SupabaseClient
}

describe("dispatchAlerts failure visibility", () => {
  it("reports a degraded dispatch when the delivery claim fails", async () => {
    const db = seededDb()
    const { dispatchAlerts } = await import("./dispatch")

    const res = await dispatchAlerts(
      withFailure(db, { rpc: "claim_due_alert_deliveries" }),
      []
    )

    // Without this the poll reports a healthy 200 {"alertsSent":0} while no
    // alert can ever be delivered.
    expect(res.degraded).toBe(true)
  })

  it("keeps a claimed delivery pending when the event lookup fails, rather than pausing it forever", async () => {
    const db = seededDb()
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    await run(db, [evaluation(50, 50)])
    const delivery = db.tables.alert_deliveries[0]
    expect(delivery.status).toBe("pending")
    delivery.next_attempt_at = new Date(Date.now() - 60_000).toISOString()

    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_events" }),
      []
    )

    // A failed lookup must not be read as "the event is gone": that records a
    // non-retryable pause, which only re-arms if a destination is edited, so a
    // momentary blip would permanently suppress a real alert.
    expect(delivery.status).toBe("pending")
    expect(delivery.attempt_count).toBe(1)
    expect(res.degraded).toBe(true)
  })

  it("keeps the high-water mark unarmed when the destination lookup fails on an install with no email channel", async () => {
    // The self-host default: no Postmark token, so a webhook is the only
    // channel. POSTMARK_SERVER_TOKEN gates the email delivery row.
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "")
    const db = seededDb({ destinations: [webhookDestination()] })
    const { dispatchAlerts } = await import("./dispatch")

    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_destinations" }),
      [evaluation(50, 50)]
    )

    // A failed lookup must not be read as "no external channel is configured":
    // that satisfies the event and advances the high-water mark, so the
    // connection never becomes an escalation candidate again and the webhook
    // never fires - permanent suppression from one bad second.
    expect(db.tables.connections[0].notified_level).toBe("none")
    expect(
      db.tables.alert_events.filter((e) => e.delivery_satisfied_at !== null)
    ).toEqual([])
    expect(res.degraded).toBe(true)
  })

  it("reports a degraded dispatch when the recipient lookup fails", async () => {
    const db = seededDb()
    const { dispatchAlerts } = await import("./dispatch")

    const res = await dispatchAlerts(withFailure(db, { table: "users" }), [
      evaluation(50, 50),
    ])

    // Every candidate is skipped when the lookup fails, so no alert is ever
    // prepared. Nothing is written, so it self-heals - but a persistent
    // failure (a revoked grant) is silent, reporting alertsSent: 0 forever.
    expect(db.tables.alert_events).toEqual([])
    expect(res.degraded).toBe(true)
  })

  it("does not fire a recovered connection's stale delivery when the active-event probe blips", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "")
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])
    // Every channel failed, so the high-water mark never armed: the active
    // event is the only trace that this alert is still in flight.
    expect(db.tables.alert_deliveries[0].status).toBe("pending")
    expect(db.tables.connections[0].notified_level).toBe("none")
    db.tables.alert_deliveries[0].next_attempt_at = new Date(
      Date.now() - 60_000
    ).toISOString()

    const fetchMock = vi.fn(async () => new Response("x", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_events", times: 1 }),
      [evaluation(500, 50, { severity: "healthy" })]
    )

    // The balance recovered, so this delivery must be canceled, not sent. A
    // blip on the probe reads as "nothing in flight", and the stale low-balance
    // webhook then fires against a healthy balance.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.degraded).toBe(true)
  })

  it("reports a degraded dispatch when recording a delivery result fails", async () => {
    const db = seededDb()
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Postmark error 503",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    await run(db, [evaluation(50, 50)])
    const delivery = db.tables.alert_deliveries[0]
    delivery.next_attempt_at = new Date(Date.now() - 60_000).toISOString()

    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { rpc: "record_alert_delivery_result" }),
      []
    )

    // An unrecorded result leaves the row claimed until the lease lapses, so
    // the next poll re-sends it. Silently, that is a duplicate-alert loop.
    expect(res.degraded).toBe(true)
  })
})

describe("retry backoff schedule", () => {
  it("follows the 15m / 1h / 6h / 24h capped schedule", async () => {
    const { retryBackoffMinutes } = await import("./dispatch")
    expect(retryBackoffMinutes(0)).toBe(15)
    expect(retryBackoffMinutes(1)).toBe(60)
    expect(retryBackoffMinutes(2)).toBe(360)
    expect(retryBackoffMinutes(3)).toBe(1440)
    expect(retryBackoffMinutes(12)).toBe(1440)
  })
})
