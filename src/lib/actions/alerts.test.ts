import type { postAlertDestination } from "@/lib/alerts/destinations"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const revalidatePath = vi.fn()

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

type Filter = [string, unknown]
type Recorded = { table: string; verb: string; filters: Filter[] }

// Minimal thenable query builder that records the verb + filter chain per
// from() call, so tests can assert every mutation is scoped to the user.
function fakeDb(
  options: {
    errorOn?: string
    // Row handed back by maybeSingle(), i.e. the "load one of my rows" reads.
    row?: Record<string, unknown> | null
    rpcRows?: Record<string, unknown>[]
    rpcError?: boolean
  } = {}
) {
  const recorded: Recorded[] = []
  const rpcCalls: string[] = []
  const updates: Record<string, unknown>[] = []
  function from(table: string) {
    const rec: Recorded = { table, verb: "", filters: [] }
    recorded.push(rec)
    const result = () => ({
      data: null,
      error:
        options.errorOn === `${rec.table}.${rec.verb}` ? { code: "x" } : null,
    })
    const builder = {
      select: () => {
        if (!rec.verb) rec.verb = "select"
        return builder
      },
      update: (patch: Record<string, unknown>) => {
        rec.verb = "update"
        updates.push(patch)
        return builder
      },
      delete: () => {
        rec.verb = "delete"
        return builder
      },
      eq: (col: string, val: unknown) => {
        rec.filters.push([col, val])
        return builder
      },
      single: async () => result(),
      maybeSingle: async () => ({
        data: result().error ? null : (options.row ?? null),
        error: result().error,
      }),
      // biome-ignore lint/suspicious/noThenProperty: mimics Supabase's thenable query builder
      then: (resolve: (v: unknown) => void) => resolve(result()),
    }
    return builder
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from,
    rpc: async (name: string) => {
      rpcCalls.push(name)
      return options.rpcError
        ? { data: null, error: { code: "x" } }
        : {
            data: options.rpcRows ?? [{ allowed: true, reset_seconds: 300 }],
            error: null,
          }
    },
  } as unknown as SupabaseClient
  return { client, recorded, rpcCalls, updates }
}

function filtersOf(recorded: Recorded[], table: string, verb: string) {
  return recorded.find((r) => r.table === table && r.verb === verb)?.filters
}

async function importActions(
  db: ReturnType<typeof fakeDb>,
  // Only the test-send suite needs these: it is the one action that decrypts a
  // stored URL and makes an outbound request.
  send?: { post: ReturnType<typeof vi.fn>; decryptThrows?: boolean }
) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => db.client,
  }))
  if (send) {
    vi.doMock("@/lib/crypto", () => ({
      encrypt: (value: string) => `enc(${value})`,
      decrypt: (value: string) => {
        if (send.decryptThrows) throw new Error("bad ciphertext")
        return value.replace(/^enc\(/, "").replace(/\)$/, "")
      },
    }))
    vi.doMock("@/lib/alerts/destinations", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/alerts/destinations")>()),
      postAlertDestination: send.post,
    }))
  }
  return import("./alerts")
}

function formData(entries: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(entries)) fd.set(key, value)
  return fd
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("toggleAlertDestination", () => {
  it("reports success and scopes the update to the signed-in user", async () => {
    const db = fakeDb()
    const { toggleAlertDestination } = await importActions(db)

    const result = await toggleAlertDestination(
      formData({ id: "dest-1", enabled: "true" })
    )

    expect(result).toEqual({ ok: true })
    expect(filtersOf(db.recorded, "alert_destinations", "update")).toEqual(
      expect.arrayContaining([
        ["id", "dest-1"],
        ["user_id", "user-1"],
      ])
    )
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("surfaces a database failure instead of swallowing it", async () => {
    const db = fakeDb({ errorOn: "alert_destinations.update" })
    const { toggleAlertDestination } = await importActions(db)

    const result = await toggleAlertDestination(
      formData({ id: "dest-1", enabled: "false" })
    )

    expect(result).toEqual({
      ok: false,
      error: "Couldn't update the destination.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects a missing id without touching the database", async () => {
    const db = fakeDb()
    const { toggleAlertDestination } = await importActions(db)

    const result = await toggleAlertDestination(formData({ enabled: "true" }))

    expect(result).toMatchObject({ ok: false })
    expect(db.recorded).toHaveLength(0)
  })
})

describe("deleteAlertDestination", () => {
  it("reports success and scopes the delete to the signed-in user", async () => {
    const db = fakeDb()
    const { deleteAlertDestination } = await importActions(db)

    const result = await deleteAlertDestination(formData({ id: "dest-1" }))

    expect(result).toEqual({ ok: true })
    expect(filtersOf(db.recorded, "alert_destinations", "delete")).toEqual(
      expect.arrayContaining([
        ["id", "dest-1"],
        ["user_id", "user-1"],
      ])
    )
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("surfaces a database failure instead of swallowing it", async () => {
    const db = fakeDb({ errorOn: "alert_destinations.delete" })
    const { deleteAlertDestination } = await importActions(db)

    const result = await deleteAlertDestination(formData({ id: "dest-1" }))

    expect(result).toEqual({
      ok: false,
      error: "Couldn't remove the destination.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe("markAlertEventRead", () => {
  it("reports success and scopes the update to the signed-in user", async () => {
    const db = fakeDb()
    const { markAlertEventRead } = await importActions(db)

    const result = await markAlertEventRead(formData({ id: "event-1" }))

    expect(result).toEqual({ ok: true })
    expect(filtersOf(db.recorded, "alert_events", "update")).toEqual(
      expect.arrayContaining([
        ["id", "event-1"],
        ["user_id", "user-1"],
      ])
    )
    expect(revalidatePath).toHaveBeenCalledWith("/alerts")
  })

  it("surfaces a database failure instead of swallowing it", async () => {
    const db = fakeDb({ errorOn: "alert_events.update" })
    const { markAlertEventRead } = await importActions(db)

    const result = await markAlertEventRead(formData({ id: "event-1" }))

    expect(result).toEqual({
      ok: false,
      error: "Couldn't mark the alert read.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

const SECRET_URL = "https://hooks.example.com/services/T000/B000/xxxxSECRETxxxx"

function testSendDb(options: Parameters<typeof fakeDb>[0] = {}) {
  return fakeDb({
    row: {
      id: "dest-1",
      kind: "webhook",
      encrypted_url: `enc(${SECRET_URL})`,
      encrypted_signing_secret: "enc(qcwh_testsecret)",
    },
    ...options,
  })
}

describe("sendTestAlertDestination", () => {
  it("sends to the decrypted URL and stamps attempt + success", async () => {
    const db = testSendDb()
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(result).toEqual({ ok: true })
    expect(post).toHaveBeenCalledWith(
      "webhook",
      SECRET_URL,
      expect.objectContaining({ isTest: true }),
      // No idempotency key: that header identifies a retried real delivery.
      undefined,
      "qcwh_testsecret"
    )
    const health = db.updates.at(-1) as Record<string, unknown>
    expect(health.last_attempt_at).toEqual(health.last_sent_at)
    expect(health.last_error).toBeNull()
    expect(filtersOf(db.recorded, "alert_destinations", "update")).toEqual(
      expect.arrayContaining([
        ["id", "dest-1"],
        ["user_id", "user-1"],
      ])
    )
    expect(revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("leaves updated_at and the poller's failure streak alone", async () => {
    const db = testSendDb()
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    await sendTestAlertDestination(formData({ id: "dest-1" }))

    // Bumping updated_at would re-arm paused deliveries and re-fire real
    // alerts; consecutive_failures is the poller's streak, not a probe's.
    const health = db.updates.at(-1) as Record<string, unknown>
    expect(health).not.toHaveProperty("updated_at")
    expect(health).not.toHaveProperty("consecutive_failures")
  })

  it("records a failed attempt without claiming a success", async () => {
    const db = testSendDb()
    const post = vi.fn(async () => ({
      ok: false as const,
      error: "HTTP 404",
      retryable: false,
    }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(result).toEqual({
      ok: false,
      error: "Test delivery failed (HTTP 404).",
    })
    const health = db.updates.at(-1) as Record<string, unknown>
    expect(health.last_error).toBe("HTTP 404")
    expect(health).not.toHaveProperty("last_sent_at")
  })

  it("never returns the destination URL in an error", async () => {
    const db = testSendDb()
    const post = vi.fn(async () => ({
      ok: false as const,
      error: "Webhook request failed.",
      retryable: true,
    }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).not.toContain("SECRET")
  })

  it("consumes the rate limit before sending and refuses when denied", async () => {
    const db = testSendDb({
      rpcRows: [{ allowed: false, reset_seconds: 120 }],
    })
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(db.rpcCalls).toEqual(["consume_test_delivery_rate_limit"])
    expect(post).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: "Too many test sends. Try again in 2 minutes.",
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("refuses rather than sending when the limiter itself fails", async () => {
    const db = testSendDb({ rpcError: true })
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(post).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: false })
  })

  it("refuses a destination that is not the signed-in user's", async () => {
    const db = testSendDb({ row: null })
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(result).toEqual({ ok: false, error: "Couldn't find that webhook." })
    expect(post).not.toHaveBeenCalled()
    expect(db.rpcCalls).toEqual([])
    expect(filtersOf(db.recorded, "alert_destinations", "select")).toEqual(
      expect.arrayContaining([
        ["id", "dest-1"],
        ["user_id", "user-1"],
      ])
    )
  })

  it("rejects a missing id without touching the database", async () => {
    const db = testSendDb()
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    const result = await sendTestAlertDestination(formData({}))

    expect(result).toMatchObject({ ok: false })
    expect(db.recorded).toHaveLength(0)
    expect(post).not.toHaveBeenCalled()
  })

  it("reports undecryptable storage instead of sending garbage", async () => {
    const db = testSendDb()
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, {
      post,
      decryptThrows: true,
    })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(result).toMatchObject({ ok: false })
    expect(post).not.toHaveBeenCalled()
  })
})

describe("test deliveries and webhook signing", () => {
  it("signs the test with the destination's own secret", async () => {
    const db = testSendDb()
    const post = vi.fn<typeof postAlertDestination>(async () => ({ ok: true }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(post.mock.calls[0][4]).toBe("qcwh_testsecret")
  })

  it("sends unsigned only when the destination has no secret", async () => {
    const db = testSendDb({
      row: {
        id: "dest-1",
        kind: "slack_webhook",
        encrypted_url: `enc(${SECRET_URL})`,
        encrypted_signing_secret: null,
      },
    })
    const post = vi.fn<typeof postAlertDestination>(async () => ({ ok: true }))
    const { sendTestAlertDestination } = await importActions(db, { post })

    await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(post.mock.calls[0][4]).toBeNull()
  })

  it("fails closed rather than downgrading an unreadable secret to unsigned", async () => {
    const db = testSendDb()
    const post = vi.fn(async () => ({ ok: true as const }))
    const { sendTestAlertDestination } = await importActions(db, {
      post,
      decryptThrows: true,
    })

    const result = await sendTestAlertDestination(formData({ id: "dest-1" }))

    expect(result).toMatchObject({ ok: false })
    expect(post).not.toHaveBeenCalled()
  })
})
