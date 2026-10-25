import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_ACTIVE_TOKENS_PER_USER } from "../auth/api-token"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

type RpcCall = [string, Record<string, unknown>]
type Filter = [string, unknown]

// Minimal fake of the Supabase client createApiToken and revokeApiToken use.
// Creation goes through the create_api_token RPC (migration 051), which
// returns the new token's ID or null when the caller is at the cap; revoke
// still uses the chained query builder, which is thenable (Supabase's builders
// resolve directly via `await`, no terminal method).
function fakeSupabase(): {
  client: SupabaseClient
  state: {
    rpcResult: unknown
    rpcError: { message: string } | null
  }
  rpcCalls: RpcCall[]
  filters: Filter[]
} {
  const state = {
    rpcResult: "tok-new" as unknown,
    rpcError: null as { message: string } | null,
  }
  const rpcCalls: RpcCall[] = []
  const filters: Filter[] = []

  function from(_table: string) {
    const builder = {
      update: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push([col, val])
        return builder
      },
      is: (col: string, val: unknown) => {
        filters.push([col, val])
        return builder
      },
      // biome-ignore lint/suspicious/noThenProperty: mimics Supabase's thenable query builder
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    }
    return builder
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args])
      return { data: state.rpcResult, error: state.rpcError }
    },
  } as unknown as SupabaseClient

  return { client, state, rpcCalls, filters }
}

async function importActions(db: { client: SupabaseClient }) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => db.client,
  }))
  return import("./api-tokens")
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

describe("createApiToken active-token cap", () => {
  it("creates a token when the user is under the cap", async () => {
    const db = fakeSupabase()
    const { createApiToken } = await importActions(db)

    const result = await createApiToken(null, formData({ name: "CI key" }))

    expect(result).toMatchObject({ ok: true })
    expect(db.rpcCalls).toHaveLength(1)
  })

  it("enforces the cap inside the atomic RPC rather than a separate count", async () => {
    const db = fakeSupabase()
    const { createApiToken } = await importActions(db)

    await createApiToken(null, formData({ name: "CI key" }))

    expect(db.rpcCalls[0][0]).toBe("create_api_token")
    expect(db.rpcCalls[0][1]).toMatchObject({
      p_name: "CI key",
      p_max_active: MAX_ACTIVE_TOKENS_PER_USER,
    })
  })

  it("rejects creation at the cap with a clear message", async () => {
    const db = fakeSupabase()
    // The RPC signals "already at the cap" by returning null, not an error.
    db.state.rpcResult = null
    const { createApiToken } = await importActions(db)

    const result = await createApiToken(
      null,
      formData({ name: "One too many" })
    )

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      error: expect.stringContaining(String(MAX_ACTIVE_TOKENS_PER_USER)),
    })
  })

  it("surfaces a database failure instead of allowing creation", async () => {
    const db = fakeSupabase()
    db.state.rpcError = { message: "boom" }
    db.state.rpcResult = null
    const { createApiToken } = await importActions(db)

    const result = await createApiToken(null, formData({ name: "Key" }))

    expect(result).toEqual({ ok: false, error: "Couldn't create the token." })
  })

  it("rejects an empty name before touching the database", async () => {
    const db = fakeSupabase()
    const { createApiToken } = await importActions(db)

    const result = await createApiToken(null, formData({ name: "   " }))

    expect(result).toEqual({ ok: false, error: "Give the token a name." })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it("rejects an over-long name before touching the database", async () => {
    const db = fakeSupabase()
    const { createApiToken } = await importActions(db)

    const result = await createApiToken(
      null,
      formData({ name: "x".repeat(81) })
    )

    expect(result).toEqual({
      ok: false,
      error: "Name must be 80 characters or fewer.",
    })
    expect(db.rpcCalls).toHaveLength(0)
  })

  it("still lets an existing token be revoked when the user is at the cap", async () => {
    const db = fakeSupabase()
    const { revokeApiToken } = await importActions(db)

    const result = await revokeApiToken(null, formData({ id: "tok-1" }))

    expect(result).toEqual({ ok: true })
  })
})

describe("revokeApiToken", () => {
  // `authenticated` lost UPDATE on api_tokens in migration 052 (QUO-58), so a
  // direct table write would now fail; revocation must go through the RPC.
  it("revokes through the SECURITY DEFINER RPC, not a table update", async () => {
    const db = fakeSupabase()
    const { revokeApiToken } = await importActions(db)

    await revokeApiToken(null, formData({ id: "tok-1" }))

    expect(db.rpcCalls).toEqual([["revoke_api_token", { p_token_id: "tok-1" }]])
    expect(db.filters).toEqual([])
  })

  it("surfaces an RPC failure instead of claiming the token was revoked", async () => {
    const db = fakeSupabase()
    db.state.rpcError = { message: "boom" }
    const { revokeApiToken } = await importActions(db)

    const result = await revokeApiToken(null, formData({ id: "tok-1" }))

    expect(result).toEqual({ ok: false, error: "Couldn't revoke the token." })
  })

  it("rejects a missing token ID before touching the database", async () => {
    const db = fakeSupabase()
    const { revokeApiToken } = await importActions(db)

    const result = await revokeApiToken(null, formData({ id: "  " }))

    expect(result).toEqual({ ok: false, error: "Missing token ID." })
    expect(db.rpcCalls).toHaveLength(0)
  })
})

describe("createApiToken scope choice", () => {
  it("issues a read-only token when no scope is chosen", async () => {
    const db = fakeSupabase()
    const { createApiToken } = await importActions(db)

    await createApiToken(null, formData({ name: "CI key" }))

    expect(db.rpcCalls[0][1]).toMatchObject({ p_scopes: ["read"] })
  })

  it("issues read plus write when the write scope is chosen", async () => {
    const db = fakeSupabase()
    const { createApiToken } = await importActions(db)

    await createApiToken(null, formData({ name: "Mac app", scope: "write" }))

    expect(db.rpcCalls[0][1]).toMatchObject({ p_scopes: ["read", "write"] })
  })

  it("rejects an unknown scope before touching the database", async () => {
    const db = fakeSupabase()
    const { createApiToken } = await importActions(db)

    const result = await createApiToken(
      null,
      formData({ name: "Key", scope: "admin" })
    )

    expect(result).toEqual({ ok: false, error: "Pick a token scope." })
    expect(db.rpcCalls).toHaveLength(0)
  })
})
