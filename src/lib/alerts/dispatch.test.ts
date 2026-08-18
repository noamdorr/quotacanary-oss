import { encrypt } from "@/lib/crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AlertEvaluation } from "./severity"
import { verifyWebhookSignature } from "./signing"

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

// Webhook deliveries go out over the pinned-address transport, which resolves
// with the response status. Stub it rather than global fetch: the real one
// opens a TLS socket to the pinned IP.
const { postToPinnedAddress } = vi.hoisted(() => ({
  postToPinnedAddress: vi.fn(),
}))
vi.mock("./pinned-post", () => ({ postToPinnedAddress }))

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
        // Migration 049: a canceled event's delivery is never due, however its
        // row came to be left pending.
        if (event.delivery_canceled_at) return false
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
        // Migration 056: advance only the pools the event named, and only
        // upward, then recompute the connection-level rollup.
        if (conn) {
          const levels = { ...((conn.notified_levels as Row) ?? {}) }
          for (const ct of (event.credit_types as string[] | null) ?? []) {
            if (rankOf(levels[ct]) < rankOf(event.level)) {
              levels[ct] = event.level
            }
          }
          conn.notified_levels = levels
          conn.notified_level = Object.values(levels).reduce(
            (highest: unknown, level) =>
              rankOf(level) > rankOf(highest) ? level : highest,
            "none"
          )
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

// Pass `email: null` for the webhook-only shape: no address on file is the
// only condition that leaves email out of a sendable escalation.
function seededDb(
  opts: {
    notifyMode?: string
    destinations?: Row[]
    email?: string | null
  } = {}
) {
  return fakeDb({
    users: [
      {
        id: "u1",
        email: opts.email !== undefined ? opts.email : "a@b.com",
        notify_mode: opts.notifyMode ?? "low_and_critical",
        updated_at: T0,
      },
    ],
    connections: [
      {
        id: "c1",
        notified_level: "none",
        notified_levels: {},
        alert_fired_at: null,
      },
    ],
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
    notifiedLevels: {},
    pools: [
      {
        creditType: "credits",
        label: "Credits",
        balance,
        low,
        critical: null,
        unit: "credits",
      },
    ],
    ...overrides,
  }
}

function stubWebhookResponse(status: number) {
  postToPinnedAddress.mockResolvedValue({ status })
}

function webhookSends() {
  return postToPinnedAddress.mock.calls.map(
    ([opts]) =>
      opts as { url: string; headers: Record<string, string>; body: string }
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
  // clearAllMocks does not drop implementations, so a failure override would
  // otherwise leak into every later test and make them pass for a false reason.
  sendEmail.mockResolvedValue({ ok: true })
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
    const res = await run(db, [
      evaluation(50, 50, {
        pools: [
          {
            creditType: "credits",
            label: "Credits",
            balance: 50,
            low: 50,
            critical: null,
            unit: null,
          },
          {
            creditType: "proxy_gb",
            label: "Proxy GB",
            balance: 60,
            low: 50,
            critical: null,
            unit: null,
          },
        ],
      }),
    ])

    expect(res.sent).toBe(1)
    const model = renderAlertEmail.mock.calls[0][0] as {
      pools: { label: string }[]
    }
    expect(model.pools.map((p) => p.label)).toEqual(["Credits"])
  })

  it("leaves a connection alone when no pool has crossed", async () => {
    const db = seededDb()
    const res = await run(db, [evaluation(60, 50, { severity: "healthy" })])

    expect(res.sent).toBe(0)
    expect(db.tables.alert_events).toHaveLength(0)
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

    expect(postToPinnedAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/hook",
        body: expect.stringContaining("quota.alert.low"),
      })
    )
    const deliveryId = webhookSends()[0].headers["idempotency-key"]
    expect(db.tables.alert_deliveries.map((d) => d.id)).toContain(deliveryId)
  })

  it("signs the delivery with the destination's stored secret", async () => {
    const db = seededDb({
      destinations: [
        webhookDestination({
          encrypted_signing_secret: encrypt("qcwh_stored"),
          signing_secret_set_at: T0,
        }),
      ],
    })
    await run(db, [evaluation(50, 50)])

    const sent = webhookSends()[0]
    expect(
      verifyWebhookSignature({
        secret: "qcwh_stored",
        header: sent.headers["quotacanary-signature"],
        body: sent.body,
        nowSeconds: Math.floor(Date.now() / 1000),
      })
    ).toEqual({ ok: true })
  })

  it("sends unsigned when the destination predates signing secrets", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    await run(db, [evaluation(50, 50)])

    expect(webhookSends()[0].headers["quotacanary-signature"]).toBeUndefined()
    expect(db.tables.alert_deliveries[0].status).toBe("succeeded")
  })

  // Falling back to an unsigned send would be worse than not delivering: a
  // receiver that skips verification would accept a delivery its owner believes
  // is signed.
  it("pauses rather than sending unsigned when the stored secret cannot be decrypted", async () => {
    const db = seededDb({
      destinations: [
        webhookDestination({
          encrypted_signing_secret: "not-a-ciphertext",
          signing_secret_set_at: T0,
        }),
      ],
      email: null,
    })
    await run(db, [evaluation(50, 50)])

    expect(postToPinnedAddress).not.toHaveBeenCalled()
    const delivery = db.tables.alert_deliveries[0]
    expect(delivery.status).toBe("paused")
    expect(delivery.last_error).toContain("signing secret")
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
    postToPinnedAddress.mockClear()
    await run(db, [evaluation(50, 50)])
    expect(db.tables.alert_events).toHaveLength(1)
    expect(db.tables.alert_deliveries).toHaveLength(2)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(postToPinnedAddress).not.toHaveBeenCalled()

    // Age only the email delivery; the next poll retries just that one.
    sendEmail.mockResolvedValue({ ok: true } as never)
    const email = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "email"
    )
    if (!email) throw new Error("missing email delivery")
    email.next_attempt_at = new Date(Date.now() - 60_000).toISOString()

    await run(db, [evaluation(50, 50)])
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(postToPinnedAddress).not.toHaveBeenCalled()
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
    postToPinnedAddress.mockClear()
    const email = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "email"
    )
    if (!email) throw new Error("missing email delivery")
    email.next_attempt_at = new Date(Date.now() - 60_000).toISOString()

    await run(db, [
      evaluation(50, 50, {
        notifiedLevel: "low",
        notifiedLevels: { credits: "low" },
      }),
    ])

    expect(postToPinnedAddress).not.toHaveBeenCalled()
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

  it("prepares the email delivery even when Postmark is not configured yet", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "")
    // Mirrors the real client, which treats a missing token as retryable.
    sendEmail.mockResolvedValue({
      ok: false,
      error: "Email not configured.",
      retryable: true,
      // biome-ignore lint/suspicious/noExplicitAny: mock override
    } as any)
    const db = seededDb()

    const res = await run(db, [evaluation(50, 50)])

    // Skipping the row instead reads as "no external channel is configured",
    // which satisfies the event and advances the high-water mark. Configuring
    // the token later never resurrects the alert: the connection is not a
    // candidate again until it deteriorates to critical or fully recovers.
    expect(db.tables.alert_deliveries).toHaveLength(1)
    expect(db.tables.alert_deliveries[0].delivery_key).toBe("email")
    expect(db.tables.alert_deliveries[0].status).toBe("pending")
    expect(db.tables.alert_events[0].delivery_satisfied_at).toBeNull()
    expect(db.tables.connections[0].notified_level).toBe("none")
    expect(res.failedSends).toBe(1)
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
          {
            creditType: "credits",
            label: "Credits",
            balance: 5,
            low: 50,
            critical: 10,
            unit: null,
          },
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

  it("leaves a paused webhook paused on later polls", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({ ok: true } as never)
    stubWebhookResponse(404)

    await run(db, [evaluation(50, 50)])
    const hook = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "destination:dest-1"
    )
    expect(hook?.attempt_count).toBe(1)

    // A later poll with nothing new to report. The pause re-arms on a
    // destination edit; the attempt's own health write is not an edit. Assert
    // attempt_count, not status: a re-armed delivery fails and pauses again,
    // so status reads "paused" either way.
    await run(db, [])

    expect(hook?.attempt_count).toBe(1)
    expect(db.tables.alert_destinations[0].consecutive_failures).toBe(1)
  })

  it("re-arms a paused webhook once its destination is edited", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    sendEmail.mockResolvedValue({ ok: true } as never)
    stubWebhookResponse(404)

    await run(db, [evaluation(50, 50)])
    const hook = db.tables.alert_deliveries.find(
      (d) => d.delivery_key === "destination:dest-1"
    )
    expect(hook?.attempt_count).toBe(1)

    // What toggleAlertDestination stamps when the user fixes the destination.
    db.tables.alert_destinations[0].updated_at = new Date(
      Date.now() + 60_000
    ).toISOString()
    await run(db, [])

    expect(hook?.attempt_count).toBe(2)
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

// A builder that mirrors the real one until a write is requested, then fails
// only that write. Failing a table wholesale also blinds its reads: dispatch
// reads alert_events three times before it ever writes to it, so a wholesale
// failure aborts the poll on the first read and the write under test never
// runs at all.
function writeFailingBuilder(
  // biome-ignore lint/suspicious/noExplicitAny: test double for the builder
  real: any,
  error: { message: string },
  take: () => boolean
) {
  const passthrough =
    (method: string) =>
    (...args: unknown[]) => {
      real[method](...args)
      return api
    }
  const failingWrite =
    (method: string) =>
    (...args: unknown[]) => {
      if (take()) return failingBuilder(error)
      real[method](...args)
      return api
    }
  // biome-ignore lint/suspicious/noExplicitAny: test double for the builder
  const api: any = {
    select: passthrough("select"),
    eq: passthrough("eq"),
    in: passthrough("in"),
    is: passthrough("is"),
    single: passthrough("single"),
    maybeSingle: passthrough("maybeSingle"),
    insert: failingWrite("insert"),
    update: failingWrite("update"),
    upsert: failingWrite("upsert"),
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are thenables; the fake must be awaitable the same way.
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      real.then(resolve, reject),
  }
  return api
}

// Wrap a fake db so one rpc or one table fails, simulating a transient
// database error partway through a poll. `times` bounds how many queries
// against the table fail, so a test can model one bad second rather than a
// table that is down for the whole poll - the two have different blast radii.
// `writesOnly` narrows the failure to the table's writes, leaving its reads
// intact, which is the only way to reach a write whose own table is read first.
function withFailure(
  db: ReturnType<typeof fakeDb>,
  failure: {
    rpc?: string
    table?: string
    times?: number
    writesOnly?: boolean
  }
) {
  const error = { message: "transient database failure" }
  let remaining = failure.times ?? Number.POSITIVE_INFINITY
  const take = () => {
    if (remaining <= 0) return false
    remaining--
    return true
  }
  const base = db.client as unknown as {
    from: (name: string) => unknown
    rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>
  }
  return {
    from: (name: string) => {
      if (name !== failure.table) return base.from(name)
      if (failure.writesOnly) {
        return writeFailingBuilder(base.from(name), error, take)
      }
      return take() ? failingBuilder(error) : base.from(name)
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
    // No address on file, so a webhook is the only channel and the no-channel
    // branch is genuinely reachable for this user.
    const db = seededDb({ destinations: [webhookDestination()], email: null })
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
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])
    // Every channel failed, so the high-water mark never armed: the active
    // event is the only trace that this alert is still in flight.
    expect(db.tables.alert_deliveries[0].status).toBe("pending")
    expect(db.tables.connections[0].notified_level).toBe("none")
    db.tables.alert_deliveries[0].next_attempt_at = new Date(
      Date.now() - 60_000
    ).toISOString()

    stubWebhookResponse(200)
    postToPinnedAddress.mockClear()
    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_events", times: 1 }),
      [evaluation(500, 50, { severity: "healthy" })]
    )

    // The balance recovered, so this delivery must be canceled, not sent. A
    // blip on the probe reads as "nothing in flight", and the stale low-balance
    // webhook then fires against a healthy balance.
    expect(postToPinnedAddress).not.toHaveBeenCalled()
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

// Every write in dispatch discards its error. A failed write is self-healing by
// construction - the next poll recomputes the same evaluation from live
// balances and reissues the same write - EXCEPT where a second write hides the
// first one's failure. Those pairs, not the site count, are the blast radius.
describe("dispatchAlerts write failures", () => {
  const criticalEvaluation = () =>
    evaluation(5, 50, {
      severity: "critical",
      pools: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 5,
          low: 50,
          critical: 10,
          unit: null,
        },
      ],
    })

  it("never claims a delivery whose event was canceled", async () => {
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])
    const delivery = db.tables.alert_deliveries[0]
    expect(delivery.status).toBe("pending")
    delivery.next_attempt_at = new Date(Date.now() - 60_000).toISOString()

    // The event is canceled but its delivery row was left pending - a failed
    // cancel write, a crash between the two writes, or any future caller that
    // closes an event without canceling its deliveries.
    db.tables.alert_events[0].delivery_canceled_at = new Date().toISOString()

    // claim_due_alert_deliveries joins alert_events but never reads its
    // canceled state, so the stale low-balance alert is still due.
    expect(db.claim(50)).toEqual([])
  })

  it("does not fire a recovered connection's stale delivery when the cancel write fails", async () => {
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])
    expect(db.tables.alert_deliveries[0].status).toBe("pending")
    db.tables.alert_deliveries[0].next_attempt_at = new Date(
      Date.now() - 60_000
    ).toISOString()

    stubWebhookResponse(200)
    postToPinnedAddress.mockClear()
    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, {
        table: "alert_deliveries",
        writesOnly: true,
        times: 1,
      }),
      [evaluation(500, 50, { severity: "healthy" })]
    )

    // A failed cancel followed by a successful close strands the delivery under
    // a canceled event, where nothing re-arms it: the connection is re-armed
    // and the event is no longer active, so recovery skips it on every later
    // poll while the claim RPC still picks the row up and sends it.
    expect(postToPinnedAddress).not.toHaveBeenCalled()
    expect(res.degraded).toBe(true)
  })

  it("reports a degraded dispatch when the recovery close write fails", async () => {
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])

    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_events", writesOnly: true, times: 1 }),
      [evaluation(500, 50, { severity: "healthy" })]
    )

    // The deliveries were canceled before the close failed, so nothing can
    // fire and the next poll re-finds the still-active event. Self-healing,
    // but silent: the alarm is the only thing the failure costs.
    expect(res.degraded).toBe(true)
    for (const d of db.tables.alert_deliveries)
      expect(d.status).toBe("canceled")
  })

  it("reports a degraded dispatch when the recovery re-arm write fails", async () => {
    const db = seededDb()
    db.tables.connections[0].notified_level = "low"
    const healthy = evaluation(500, 50, {
      severity: "healthy",
      notifiedLevel: "low",
    })

    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "connections", writesOnly: true, times: 1 }),
      [healthy]
    )

    expect(res.degraded).toBe(true)
    expect(db.tables.connections[0].notified_level).toBe("low")

    // Self-healing: the connection is still healthy on the next poll, so the
    // re-arm is retried.
    await run(db, [healthy])
    expect(db.tables.connections[0].notified_level).toBe("none")
  })

  it("does not fire a superseded low alert when the supersede cancel write fails", async () => {
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])
    db.tables.alert_deliveries[0].next_attempt_at = new Date(
      Date.now() - 60_000
    ).toISOString()

    stubWebhookResponse(200)
    postToPinnedAddress.mockClear()
    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, {
        table: "alert_deliveries",
        writesOnly: true,
        times: 1,
      }),
      [criticalEvaluation()]
    )

    // Same stranding as recovery, reached from the escalation side: once the
    // critical delivery advances the high-water mark the connection stops
    // being a candidate, so the supersede never re-runs and the stale
    // "running low" alert fires after the critical one.
    const lowSends = webhookSends().filter((opts) =>
      opts.body.includes("quota.alert.low")
    )
    expect(lowSends).toEqual([])
    expect(res.degraded).toBe(true)
  })

  it("reports a degraded dispatch when the supersede close write fails", async () => {
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    await run(db, [evaluation(50, 50)])

    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_events", writesOnly: true, times: 1 }),
      [criticalEvaluation()]
    )

    expect(res.degraded).toBe(true)
  })

  it("reports a degraded dispatch and rebuilds the delivery rows on the next poll when the upsert fails", async () => {
    const db = seededDb({ destinations: [webhookDestination()] })
    const { dispatchAlerts } = await import("./dispatch")

    const res = await dispatchAlerts(
      withFailure(db, {
        table: "alert_deliveries",
        writesOnly: true,
        times: 1,
      }),
      [evaluation(50, 50)]
    )

    expect(db.tables.alert_deliveries).toEqual([])
    expect(res.degraded).toBe(true)

    // Preparation only creates work: the next poll reuses the active event and
    // fills the rows it failed to write.
    await run(db, [evaluation(50, 50)])
    expect(db.tables.alert_events).toHaveLength(1)
    expect(db.tables.alert_deliveries.length).toBeGreaterThan(0)
  })

  it("reuses the in-app event instead of inserting a fresh one when the high-water advance fails", async () => {
    const db = seededDb({ notifyMode: "off" })
    const { dispatchAlerts } = await import("./dispatch")
    const failing = () =>
      withFailure(db, { table: "connections", writesOnly: true })

    await dispatchAlerts(failing(), [evaluation(50, 50)])
    const res = await dispatchAlerts(failing(), [evaluation(50, 50)])

    // A satisfied event cannot be reused, so satisfying one whose high-water
    // mark never advanced makes every later poll insert a fresh in-app alert:
    // 96 inbox entries a day, with every poll reporting healthy.
    expect(db.tables.alert_events).toHaveLength(1)
    expect(db.tables.connections[0].notified_level).toBe("none")
    expect(res.degraded).toBe(true)
  })

  it("reports a degraded dispatch when the in-app satisfy write fails", async () => {
    const db = seededDb({ notifyMode: "off" })
    // Seed the active event so ensureEvent reuses it and the satisfy is the
    // only alert_events write in the poll.
    db.tables.alert_events.push({
      id: "e1",
      user_id: "u1",
      connection_id: "c1",
      level: "low",
      tool_name: "Acme",
      connection_name: "Acme main",
      title: "t",
      body: "b",
      pools: [],
      credit_types: ["credits"],
      dashboard_url: "https://app.example.com/dashboard",
      topup_url: null,
      created_at: T0,
      delivery_satisfied_at: null,
      delivery_canceled_at: null,
    })

    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_events", writesOnly: true, times: 1 }),
      [evaluation(50, 50)]
    )

    // The advance landed first, so the next poll no longer sees a candidate
    // and the unsatisfied event is a phantom until recovery closes it.
    expect(res.degraded).toBe(true)
    expect(db.tables.connections[0].notified_level).toBe("low")
  })

  it("logs but does not degrade when the destination health write fails", async () => {
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    stubWebhookResponse(200)

    const { dispatchAlerts } = await import("./dispatch")
    const res = await dispatchAlerts(
      withFailure(db, { table: "alert_destinations", writesOnly: true }),
      [evaluation(50, 50)]
    )

    // The webhook was delivered and only the settings-page health row is
    // stale. degraded means the delivery loop could not do its job, so a
    // cosmetic write must not trip the alarm - it logs instead.
    expect(res.sent).toBe(1)
    expect(res.degraded).toBe(false)
    expect(errorLog).toHaveBeenCalled()
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

// ---------------------------------------------------------------------------
// Per-pool high-water marks (QUO-61)
//
// Multi-pool vendors are a large share of the catalog. With one mark per
// connection, the second pool to cross a level was silent until it
// deteriorated to critical or the whole connection recovered.
// ---------------------------------------------------------------------------

describe("dispatchAlerts per-pool high-water marks", () => {
  // Mirrors what refresh-connection hands dispatch: readings plus the marks as
  // they stand in the connection row right now.
  function poll(db: ReturnType<typeof fakeDb>, balances: [string, number][]) {
    const conn = db.tables.connections[0]
    return run(db, [
      evaluation(0, 50, {
        severity: balances.some(([, b]) => b <= 50) ? "low" : "healthy",
        notifiedLevel: conn.notified_level as "none" | "low" | "critical",
        notifiedLevels: (conn.notified_levels ?? {}) as Record<
          string,
          "low" | "critical"
        >,
        pools: balances.map(([creditType, balance]) => ({
          creditType,
          label: creditType,
          balance,
          low: 50,
          critical: null,
          unit: null,
        })),
      }),
    ])
  }

  const emailedPools = () =>
    renderAlertEmail.mock.calls.map(([model]) =>
      (model as { pools: { label: string }[] }).pools.map((p) => p.label)
    )

  it("alerts a second pool crossing the same level on a later poll", async () => {
    const db = seededDb()

    // Day 1: compute units drops below its low threshold.
    expect(
      (
        await poll(db, [
          ["compute", 40],
          ["proxy", 90],
        ])
      ).sent
    ).toBe(1)
    expect(db.tables.connections[0].notified_levels).toEqual({ compute: "low" })

    // Day 5: proxy GB drops below ITS low threshold. The connection's overall
    // severity is unchanged, which is exactly what used to silence this.
    expect(
      (
        await poll(db, [
          ["compute", 40],
          ["proxy", 40],
        ])
      ).sent
    ).toBe(1)
    expect(db.tables.connections[0].notified_levels).toEqual({
      compute: "low",
      proxy: "low",
    })

    expect(db.tables.alert_events).toHaveLength(2)
    // Each alert names only the pool that was news that day.
    expect(emailedPools()).toEqual([["compute"], ["proxy"]])
  })

  it("does not resend for a pool that already alerted", async () => {
    const db = seededDb()
    await poll(db, [
      ["compute", 40],
      ["proxy", 90],
    ])
    const res = await poll(db, [
      ["compute", 40],
      ["proxy", 90],
    ])

    expect(res.sent).toBe(0)
    expect(db.tables.alert_events).toHaveLength(1)
  })

  it("re-arms only the pool that recovered", async () => {
    const db = seededDb()
    await poll(db, [
      ["compute", 40],
      ["proxy", 40],
    ])
    await poll(db, [
      ["compute", 40],
      ["proxy", 40],
    ])
    expect(db.tables.connections[0].notified_levels).toEqual({
      compute: "low",
      proxy: "low",
    })

    // compute recovers; proxy is still low, so the connection has not.
    await poll(db, [
      ["compute", 90],
      ["proxy", 40],
    ])
    expect(db.tables.connections[0].notified_levels).toEqual({ proxy: "low" })
    expect(db.tables.connections[0].notified_level).toBe("low")

    // compute crossing again is news again, and proxy still is not.
    const res = await poll(db, [
      ["compute", 40],
      ["proxy", 40],
    ])
    expect(res.sent).toBe(1)
    expect(emailedPools().at(-1)).toEqual(["compute"])
  })

  it("adopts credit types on an event created before the migration", async () => {
    // A pre-056 event already lists its pools but has no credit_types, so it
    // takes the keys without re-appending pools that are already on it.
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    db.tables.alert_events.push({
      id: "legacy",
      user_id: "u1",
      connection_id: "c1",
      level: "low",
      tool_name: "Acme",
      connection_name: "Acme main",
      title: "t",
      body: "b",
      pools: [{ label: "compute", balance: 40, threshold: 50, unit: null }],
      credit_types: null,
      dashboard_url: "https://app.example.com/dashboard",
      topup_url: null,
      created_at: T0,
      delivery_satisfied_at: null,
      delivery_canceled_at: null,
    })

    await poll(db, [["compute", 40]])
    const event = db.tables.alert_events[0]
    expect(db.tables.alert_events).toHaveLength(1)
    expect(event.credit_types).toEqual(["compute"])
    expect(event.pools).toHaveLength(1)

    // And the adopted keys are what the delivery then advances.
    stubWebhookResponse(200)
    db.tables.alert_deliveries[0].next_attempt_at = new Date(
      Date.now() - 60_000
    ).toISOString()
    await poll(db, [["compute", 40]])
    expect(db.tables.connections[0].notified_levels).toEqual({
      compute: "low",
    })
  })

  it("folds a newly crossing pool into an event still waiting on delivery", async () => {
    // Without the merge the second pool sits behind a stuck delivery forever:
    // one active event per (connection, level) means it can neither reuse the
    // event nor open its own.
    const db = seededDb({ destinations: [webhookDestination()], email: null })
    stubWebhookResponse(500)
    await poll(db, [
      ["compute", 40],
      ["proxy", 90],
    ])
    const event = db.tables.alert_events[0]
    expect(event.credit_types).toEqual(["compute"])

    await poll(db, [
      ["compute", 40],
      ["proxy", 40],
    ])
    expect(db.tables.alert_events).toHaveLength(1)
    expect(event.credit_types).toEqual(["compute", "proxy"])

    // When the webhook finally lands, both pools' marks advance together.
    stubWebhookResponse(200)
    const delivery = db.tables.alert_deliveries[0]
    delivery.next_attempt_at = new Date(Date.now() - 60_000).toISOString()
    await poll(db, [
      ["compute", 40],
      ["proxy", 40],
    ])
    expect(db.tables.connections[0].notified_levels).toEqual({
      compute: "low",
      proxy: "low",
    })
  })
})
