import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const readBalance = vi.fn(async () => ({
  ok: true as const,
  balances: [
    {
      creditType: "credits",
      label: "Credits",
      balance: 42,
      balanceLimit: 100,
      unit: "credits" as const,
    },
  ],
}))

vi.mock("@/lib/adapters/registry", () => ({
  getAdapter: (toolId: string) =>
    toolId === "unknown-tool" ? null : { readBalance },
}))

type Filter = [string, unknown]
type Recorded = {
  table: string
  verb: string
  filters: Filter[]
  payload?: unknown
}
type RpcCall = { fn: string; params: Record<string, unknown> }

// Thenable query-builder fake that records verbs and filters per from() call,
// plus the RPCs issued, so tests can assert every write is owner-scoped and
// the API insert carries the token's user id.
function fakeSupabase(
  singles: Record<string, () => unknown> = {},
  rpcResult: { data: unknown; error: unknown } = {
    data: "conn-1",
    error: null,
  },
  lists: Record<string, () => unknown> = {}
): { client: SupabaseClient; recorded: Recorded[]; rpcCalls: RpcCall[] } {
  const recorded: Recorded[] = []
  const rpcCalls: RpcCall[] = []
  function from(table: string) {
    const rec: Recorded = { table, verb: "", filters: [] }
    recorded.push(rec)
    const resolveSingle = async () => {
      const make = singles[`${rec.table}.${rec.verb}`]
      return { data: make ? make() : null, error: null }
    }
    const builder = {
      select: () => {
        if (!rec.verb) rec.verb = "select"
        return builder
      },
      update: (payload: unknown) => {
        rec.payload = payload
        rec.verb = "update"
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
      is: (col: string, val: unknown) => {
        rec.filters.push([`${col} is`, val])
        return builder
      },
      single: resolveSingle,
      maybeSingle: resolveSingle,
      // biome-ignore lint/suspicious/noThenProperty: mimics Supabase's thenable query builder
      then: (resolve: (v: unknown) => void) =>
        resolve({
          data: lists[`${rec.table}.${rec.verb}`]?.() ?? null,
          error: null,
        }),
    }
    return builder
  }
  const client = {
    from,
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params })
      return rpcResult
    }),
  } as unknown as SupabaseClient
  return { client, recorded, rpcCalls }
}

const OWNER_FILTER: Filter = ["user_id", "user-1"]
const CONN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe("prepareConnection", () => {
  it("returns the adapter's error as key_rejected and never encrypts", async () => {
    const db = fakeSupabase({
      "tools.select": () => ({ credential_fields: null, pools: null }),
    })
    readBalance.mockResolvedValueOnce({
      ok: false,
      error: "Invalid API key",
    } as never)
    const { prepareConnection } = await import("./connection-writes")

    const result = await prepareConnection(db.client, {
      toolId: "hunter",
      name: "Hunter",
      tags: [],
      watchedCreditTypes: [],
      credential: "bad-key",
    })

    expect(result).toEqual({
      ok: false,
      code: "key_rejected",
      error: "Invalid API key",
    })
  })

  it("flags a tool with no adapter as unsupported", async () => {
    const db = fakeSupabase()
    const { prepareConnection } = await import("./connection-writes")

    const result = await prepareConnection(db.client, {
      toolId: "unknown-tool",
      name: "Nope",
      tags: [],
      watchedCreditTypes: [],
      credential: "key",
    })

    expect(result).toMatchObject({ ok: false, code: "unsupported_tool" })
    expect(readBalance).not.toHaveBeenCalled()
  })

  it("accepts a plain string credential and encrypts it", async () => {
    const db = fakeSupabase({
      "tools.select": () => ({ credential_fields: null, pools: null }),
    })
    const { prepareConnection } = await import("./connection-writes")
    const { decrypt } = await import("@/lib/crypto")

    const result = await prepareConnection(db.client, {
      toolId: "hunter",
      name: "  Hunter  ",
      tags: [],
      watchedCreditTypes: [],
      credential: "hunter-key",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readBalance).toHaveBeenCalledWith("hunter-key")
    expect(result.prepared.name).toBe("Hunter")
    expect(result.prepared.encryptedKey).not.toBe("hunter-key")
    expect(decrypt(result.prepared.encryptedKey)).toBe("hunter-key")
    expect(result.prepared.keyHint).toBe("-key")
    expect(result.prepared.summary).toEqual([
      { balance: 42, label: "Credits", unit: "credits" },
    ])
  })
})

describe("prepareConnection thresholds (QUO-291)", () => {
  const draft = {
    toolId: "hunter",
    name: "Hunter",
    tags: [],
    watchedCreditTypes: [],
    credential: "hunter-key",
  }

  it("carries thresholds for balances the tool reports", async () => {
    const db = fakeSupabase({
      "tools.select": () => ({ credential_fields: null, pools: null }),
    })
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, {
      ...draft,
      poolThresholds: { credits: { low: 500, critical: 166 } },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.prepared.poolThresholds).toEqual({
      credits: { low: 500, critical: 166 },
    })
  })

  it("accepts a declared pool the reading did not report", async () => {
    const db = fakeSupabase({
      "tools.select": () => ({
        credential_fields: null,
        pools: [
          { credit_type: "credits", label: "Credits", unit: "credits" },
          { credit_type: "searches", label: "Searches", unit: "credits" },
        ],
      }),
    })
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, {
      ...draft,
      watchedCreditTypes: ["credits", "searches"],
      poolThresholds: { searches: { low: 50, critical: 16 } },
    })
    expect(result.ok).toBe(true)
  })

  it("refuses a credit type the tool does not have, as invalid", async () => {
    const db = fakeSupabase({
      "tools.select": () => ({ credential_fields: null, pools: null }),
    })
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, {
      ...draft,
      poolThresholds: { minutes: { low: 500, critical: 166 } },
    })
    expect(result).toMatchObject({ ok: false, code: "invalid" })
  })

  it("leaves poolThresholds null when none were sent", async () => {
    const db = fakeSupabase({
      "tools.select": () => ({ credential_fields: null, pools: null }),
    })
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, draft)
    expect(result.ok && result.prepared.poolThresholds).toBeNull()
  })
})

describe("prepareConnection watched balances (QUO-286)", () => {
  const twoPools = () => ({
    credential_fields: null,
    pools: [
      { credit_type: "credits", label: "Credits", unit: "credits" },
      { credit_type: "searches", label: "Searches", unit: "credits" },
    ],
  })
  const draft = {
    toolId: "apollo",
    name: "Apollo",
    tags: [],
    credential: "apollo-key",
  }
  const withExtra = {
    ok: true as const,
    balances: [
      {
        creditType: "credits",
        label: "Credits",
        balance: 42,
        balanceLimit: 100,
        unit: "credits" as const,
      },
      {
        creditType: "website_visitor_credit",
        label: "Website Visitor Credit",
        balance: 7,
        balanceLimit: 10,
        unit: "credits" as const,
      },
    ],
  }

  it("keeps an extra the key reports and a hidden declared pool", async () => {
    const db = fakeSupabase({ "tools.select": twoPools })
    readBalance.mockResolvedValueOnce(withExtra as never)
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, {
      ...draft,
      watchedCreditTypes: ["credits", "website_visitor_credit"],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.prepared.watched).toEqual([
      "credits",
      "website_visitor_credit",
    ])
    expect(result.prepared.summary.map((s) => s.label)).toEqual([
      "Credits",
      "Website Visitor Credit",
    ])
  })

  it("refuses a type neither declared nor reported, as invalid", async () => {
    const db = fakeSupabase({ "tools.select": twoPools })
    readBalance.mockResolvedValueOnce(withExtra as never)
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, {
      ...draft,
      watchedCreditTypes: ["credits", "dialer"],
    })
    expect(result).toMatchObject({ ok: false, code: "invalid" })
  })

  it("keeps a watch list for a tool that declares no pools", async () => {
    const db = fakeSupabase({
      "tools.select": () => ({ credential_fields: null, pools: null }),
    })
    readBalance.mockResolvedValueOnce(withExtra as never)
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, {
      ...draft,
      watchedCreditTypes: ["website_visitor_credit"],
    })
    expect(result.ok && result.prepared.watched).toEqual([
      "website_visitor_credit",
    ])
  })

  it("refuses more than 20 watched types before the vendor read", async () => {
    const db = fakeSupabase({ "tools.select": twoPools })
    const { prepareConnection } = await import("./connection-writes")
    const result = await prepareConnection(db.client, {
      ...draft,
      watchedCreditTypes: Array.from({ length: 21 }, (_, i) => `pool_${i}`),
    })
    expect(result).toMatchObject({ ok: false, code: "invalid" })
    expect(readBalance).not.toHaveBeenCalled()
  })
})

describe("findConnectionWithSameKey (QUO-293)", () => {
  async function setup(
    rows: { id: string; name: string; secret: string }[],
    credentialFields: unknown = null
  ) {
    const { encrypt } = await import("@/lib/crypto")
    const db = fakeSupabase(
      { "tools.select": () => ({ credential_fields: credentialFields }) },
      undefined,
      {
        "connections.select": () =>
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            encrypted_key: encrypt(r.secret),
          })),
      }
    )
    const { findConnectionWithSameKey } = await import("./connection-writes")
    return { db, findConnectionWithSameKey }
  }

  it("returns the user's connection that already holds this key", async () => {
    const { db, findConnectionWithSameKey } = await setup([
      { id: "conn-a", name: "Work", secret: "other-1234" },
      { id: "conn-b", name: "Client", secret: "hunter-key" },
    ])
    const found = await findConnectionWithSameKey(
      db.client,
      "user-1",
      "hunter",
      "hunter-key"
    )
    expect(found).toEqual({ connectionId: "conn-b", name: "Client" })
    const lookup = db.recorded.find((r) => r.table === "connections")
    expect(lookup?.filters).toEqual([OWNER_FILTER, ["tool_id", "hunter"]])
    expect(readBalance).not.toHaveBeenCalled()
  })

  it("does not match a different key with the same last four", async () => {
    const { db, findConnectionWithSameKey } = await setup([
      { id: "conn-a", name: "Work", secret: "aaaa-key" },
    ])
    expect(
      await findConnectionWithSameKey(db.client, "user-1", "hunter", "bbbb-key")
    ).toBeNull()
  })

  it("compares a multi-field credential on the whole object", async () => {
    const fields = [
      { name: "accountSid", label: "Account SID", type: "text" },
      { name: "authToken", label: "Auth token", type: "password" },
    ]
    const { db, findConnectionWithSameKey } = await setup(
      [
        {
          id: "conn-a",
          name: "Twilio",
          secret: JSON.stringify({ accountSid: "AC1", authToken: "tok" }),
        },
      ],
      fields
    )
    // Same fields in another order, as the API's string form may send them.
    expect(
      await findConnectionWithSameKey(
        db.client,
        "user-1",
        "twilio",
        JSON.stringify({ authToken: "tok", accountSid: "AC1" })
      )
    ).toEqual({ connectionId: "conn-a", name: "Twilio" })
    // Same token, another account: not the same credential.
    expect(
      await findConnectionWithSameKey(
        db.client,
        "user-1",
        "twilio",
        JSON.stringify({ accountSid: "AC2", authToken: "tok" })
      )
    ).toBeNull()
  })

  it("skips the row this same request created, so a retry is not a duplicate", async () => {
    const { encrypt } = await import("@/lib/crypto")
    const db = fakeSupabase(
      { "tools.select": () => ({ credential_fields: null }) },
      undefined,
      {
        "connections.select": () => [
          {
            id: "conn-a",
            name: "Work",
            encrypted_key: encrypt("hunter-key"),
            create_request_id: "req-1",
          },
        ],
      }
    )
    const { findConnectionWithSameKey } = await import("./connection-writes")
    expect(
      await findConnectionWithSameKey(
        db.client,
        "user-1",
        "hunter",
        "hunter-key",
        "req-1"
      )
    ).toBeNull()
    expect(
      await findConnectionWithSameKey(
        db.client,
        "user-1",
        "hunter",
        "hunter-key",
        "req-2"
      )
    ).toEqual({ connectionId: "conn-a", name: "Work" })
  })

  it("skips a row that does not decrypt", async () => {
    const db = fakeSupabase(
      { "tools.select": () => ({ credential_fields: null }) },
      undefined,
      {
        "connections.select": () => [
          { id: "conn-a", name: "Old", encrypted_key: "not:valid:cipher" },
        ],
      }
    )
    const { findConnectionWithSameKey } = await import("./connection-writes")
    expect(
      await findConnectionWithSameKey(db.client, "user-1", "hunter", "k")
    ).toBeNull()
  })
})

describe("seedPoolThresholds", () => {
  it("writes the sent balances only onto an owned connection that has none yet", async () => {
    const db = fakeSupabase()
    const { seedPoolThresholds } = await import("./connection-writes")
    const thresholds = { credits: { low: 500, critical: 166 } }

    expect(
      await seedPoolThresholds(db.client, "user-1", CONN_ID, thresholds)
    ).toEqual({ ok: true })
    expect(db.recorded[0]).toMatchObject({
      table: "connections",
      verb: "update",
      filters: [["id", CONN_ID], OWNER_FILTER, ["pool_thresholds is", null]],
      payload: expect.objectContaining({ pool_thresholds: thresholds }),
    })
  })
})

describe("insertConnectionForUser", () => {
  it("calls the service-role RPC with the given user id and the 046 parameter set", async () => {
    const db = fakeSupabase()
    const { insertConnectionForUser } = await import("./connection-writes")

    const result = await insertConnectionForUser(
      db.client,
      "user-1",
      {
        toolId: "hunter",
        name: "Hunter",
        tags: [],
        watched: null,
        encryptedKey: "enc",
        keyHint: "-key",
        balances: [
          {
            creditType: "credits",
            label: "Credits",
            balance: 42,
            balanceLimit: 100,
            unit: "credits",
          },
        ],
        summary: [],
      },
      "22222222-2222-4222-8222-222222222222"
    )

    expect(result).toEqual({ ok: true, connectionId: "conn-1" })
    expect(db.rpcCalls).toEqual([
      {
        fn: "create_connection_with_balances_for_user",
        params: {
          p_user_id: "user-1",
          p_tool_id: "hunter",
          p_encrypted_key: "enc",
          p_key_hint: "-key",
          p_name: "Hunter",
          p_tags: [],
          p_watched_credit_types: null,
          p_balances: [
            {
              credit_type: "credits",
              label: "Credits",
              balance: 42,
              balance_limit: 100,
              unit: "credits",
            },
          ],
          p_create_request_id: "22222222-2222-4222-8222-222222222222",
        },
      },
    ])
  })

  it("reports a db failure when the RPC errors or returns no id", async () => {
    const db = fakeSupabase({}, { data: null, error: { message: "boom" } })
    const { insertConnectionForUser } = await import("./connection-writes")

    const result = await insertConnectionForUser(
      db.client,
      "user-1",
      {
        toolId: "hunter",
        name: "Hunter",
        tags: [],
        watched: null,
        encryptedKey: "enc",
        keyHint: "-key",
        balances: [],
        summary: [],
      },
      "22222222-2222-4222-8222-222222222222"
    )

    expect(result).toMatchObject({ ok: false, code: "db" })
  })
})

describe("findOwnedConnection", () => {
  it("looks the row up by id AND owner", async () => {
    const db = fakeSupabase({ "connections.select": () => ({ id: CONN_ID }) })
    const { findOwnedConnection } = await import("./connection-writes")

    expect(await findOwnedConnection(db.client, "user-1", CONN_ID)).toBe(true)
    expect(db.recorded[0].filters).toEqual([["id", CONN_ID], OWNER_FILTER])
  })

  it("is false for a connection the user does not own", async () => {
    const db = fakeSupabase()
    const { findOwnedConnection } = await import("./connection-writes")

    expect(await findOwnedConnection(db.client, "user-1", CONN_ID)).toBe(false)
  })

  it("is false for a malformed id without querying", async () => {
    const db = fakeSupabase({ "connections.select": () => ({ id: "x" }) })
    const { findOwnedConnection } = await import("./connection-writes")

    expect(await findOwnedConnection(db.client, "user-1", "not-a-uuid")).toBe(
      false
    )
    expect(db.recorded).toEqual([])
  })
})

describe("owner-scoped writes", () => {
  it("rename trims, validates and filters by owner", async () => {
    const db = fakeSupabase()
    const { renameOwnedConnection } = await import("./connection-writes")

    expect(
      await renameOwnedConnection(db.client, "user-1", CONN_ID, "  New  ")
    ).toEqual({ ok: true })
    expect(db.recorded[0]).toMatchObject({
      verb: "update",
      filters: [["id", CONN_ID], OWNER_FILTER],
      payload: expect.objectContaining({ name: "New" }),
    })
    expect(
      await renameOwnedConnection(db.client, "user-1", CONN_ID, "   ")
    ).toMatchObject({ ok: false, code: "invalid" })
  })

  it("rekey reports not_found before reading the vendor when the row is not the user's", async () => {
    const db = fakeSupabase()
    const { rekeyOwnedConnection } = await import("./connection-writes")

    const result = await rekeyOwnedConnection(
      db.client,
      db.client,
      "user-1",
      CONN_ID,
      "new-key"
    )

    expect(result).toEqual({
      ok: false,
      code: "not_found",
      error: "Connection not found.",
    })
    expect(readBalance).not.toHaveBeenCalled()
    expect(db.recorded[0].filters).toEqual([["id", CONN_ID], OWNER_FILTER])
  })

  it("rekey returns the adapter's error as key_rejected without writing", async () => {
    const db = fakeSupabase({
      "connections.select": () => ({ tool_id: "hunter", tool: null }),
    })
    readBalance.mockResolvedValueOnce({ ok: false, error: "Rejected" } as never)
    const { rekeyOwnedConnection } = await import("./connection-writes")

    const result = await rekeyOwnedConnection(
      db.client,
      db.client,
      "user-1",
      CONN_ID,
      "bad-key"
    )

    expect(result).toEqual({
      ok: false,
      code: "key_rejected",
      error: "Rejected",
    })
    expect(db.recorded.some((r) => r.verb === "update")).toBe(false)
  })

  it("remove filters the delete by owner", async () => {
    const db = fakeSupabase()
    const { removeOwnedConnection } = await import("./connection-writes")

    expect(await removeOwnedConnection(db.client, "user-1", CONN_ID)).toEqual({
      ok: true,
    })
    expect(db.recorded[0]).toMatchObject({
      verb: "delete",
      filters: [["id", CONN_ID], OWNER_FILTER],
    })
  })
})
