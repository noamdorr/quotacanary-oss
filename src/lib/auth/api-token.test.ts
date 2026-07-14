import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Captures the function scheduled via next/server's after() so tests can both
// assert it was called and run the deferred work synchronously.
const after = vi.fn((fn: () => unknown) => {
  void fn()
})
const createAdminClient = vi.fn(() => adminClient)

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => after(fn),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
}))

type TokenRow = {
  id: string
  user_id: string
  revoked_at: string | null
  scopes?: string[] | null
}

// Minimal fake of the chained query builder verifyApiTokenByRaw uses:
//   .from("api_tokens").select(...).eq("token_hash", hash).maybeSingle()
// for the lookup, and .update(...).eq("id", id) for the last_used_at touch.
// consumeRateLimit instead calls .rpc("consume_api_rate_limit_v2", params),
// faked via rpcResult / rpcCalls below.
let adminClient: SupabaseClient
let lookupRow: TokenRow | null
let lookupError: { message: string } | null
const updates: { id: string; payload: Record<string, unknown> }[] = []
let rpcResult: { data: unknown; error: unknown }
const rpcCalls: { fn: string; params: Record<string, unknown> }[] = []

function makeAdminClient(): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      let updatePayload: Record<string, unknown> | null = null
      const builder = {
        select: vi.fn(() => builder),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload
          return builder
        }),
        // On the update path `.eq("id", id)` is the terminal awaited call, so it
        // records the touch and resolves. On the lookup path it chains into
        // `.maybeSingle()`, so it returns the builder.
        eq: vi.fn((_column: string, value: string) => {
          if (updatePayload) {
            updates.push({ id: value, payload: updatePayload })
            return Promise.resolve({ error: null })
          }
          return builder
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "api_tokens") {
            return { data: lookupRow, error: lookupError }
          }
          return { data: null, error: null }
        }),
      }
      return builder
    }),
    rpc: vi.fn(async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params })
      return rpcResult
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  lookupRow = null
  lookupError = null
  updates.length = 0
  rpcResult = { data: null, error: null }
  rpcCalls.length = 0
  adminClient = makeAdminClient()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("generateApiToken", () => {
  it("produces a raw token prefixed with qc_live_", async () => {
    const { generateApiToken } = await import("./api-token")
    expect(generateApiToken().raw).toMatch(/^qc_live_/)
  })

  it("returns a 64-char lowercase hex hash equal to hashApiToken(raw)", async () => {
    const { generateApiToken, hashApiToken } = await import("./api-token")
    const { raw, hash } = generateApiToken()
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(hashApiToken(raw))
  })

  it("sets hint to the last 4 chars of raw", async () => {
    const { generateApiToken } = await import("./api-token")
    const { raw, hint } = generateApiToken()
    expect(hint).toBe(raw.slice(-4))
  })

  it("produces a different raw token on each call", async () => {
    const { generateApiToken } = await import("./api-token")
    expect(generateApiToken().raw).not.toBe(generateApiToken().raw)
  })
})

describe("hashApiToken", () => {
  it("is deterministic for the same input", async () => {
    const { hashApiToken } = await import("./api-token")
    expect(hashApiToken("qc_live_abc")).toBe(hashApiToken("qc_live_abc"))
  })

  it("produces different output for different input", async () => {
    const { hashApiToken } = await import("./api-token")
    expect(hashApiToken("qc_live_a")).not.toBe(hashApiToken("qc_live_b"))
  })

  it("returns a 64-char hex string matching SHA-256", async () => {
    const { hashApiToken } = await import("./api-token")
    const raw = "qc_live_example"
    const expected = createHash("sha256").update(raw).digest("hex")
    expect(hashApiToken(raw)).toBe(expected)
    expect(hashApiToken(raw)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("verifyApiToken header parsing", () => {
  it("returns null and skips the DB when the header is missing", async () => {
    const { verifyApiToken } = await import("./api-token")
    const result = await verifyApiToken(new Request("https://x.test"))
    expect(result).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("returns null and skips the DB for a non-qc_live_ bearer token", async () => {
    const { verifyApiToken } = await import("./api-token")
    const req = new Request("https://x.test", {
      headers: { authorization: "Bearer nb_live_nope" },
    })
    expect(await verifyApiToken(req)).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("returns null and skips the DB for a raw token without the Bearer scheme", async () => {
    const { verifyApiToken } = await import("./api-token")
    const req = new Request("https://x.test", {
      headers: { authorization: "qc_live_rawtoken" },
    })
    expect(await verifyApiToken(req)).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("accepts a lowercase bearer scheme (RFC 7235 schemes are case-insensitive)", async () => {
    const { verifyApiToken } = await import("./api-token")
    lookupRow = {
      id: "tok-1",
      user_id: "user-1",
      revoked_at: null,
      scopes: ["read"],
    }
    const req = new Request("https://x.test", {
      headers: { authorization: "bearer qc_live_valid" },
    })
    expect(await verifyApiToken(req)).toEqual({
      userId: "user-1",
      tokenId: "tok-1",
      scopes: ["read"],
    })
  })

  it("accepts an uppercase BEARER scheme", async () => {
    const { verifyApiToken } = await import("./api-token")
    lookupRow = {
      id: "tok-1",
      user_id: "user-1",
      revoked_at: null,
      scopes: ["read"],
    }
    const req = new Request("https://x.test", {
      headers: { authorization: "BEARER qc_live_valid" },
    })
    expect(await verifyApiToken(req)).toEqual({
      userId: "user-1",
      tokenId: "tok-1",
      scopes: ["read"],
    })
  })

  it("returns null and skips the DB for a garbage scheme", async () => {
    const { verifyApiToken } = await import("./api-token")
    const req = new Request("https://x.test", {
      headers: { authorization: "Token qc_live_valid" },
    })
    expect(await verifyApiToken(req)).toBeNull()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe("verifyApiTokenByRaw", () => {
  it("returns null when no row matches the hash", async () => {
    const { verifyApiTokenByRaw } = await import("./api-token")
    lookupRow = null
    expect(await verifyApiTokenByRaw("qc_live_missing")).toBeNull()
  })

  it("returns null when the matched token is revoked", async () => {
    const { verifyApiTokenByRaw } = await import("./api-token")
    lookupRow = {
      id: "tok-1",
      user_id: "user-1",
      revoked_at: "2026-06-01T00:00:00.000Z",
    }
    expect(await verifyApiTokenByRaw("qc_live_revoked")).toBeNull()
    expect(updates).toHaveLength(0)
  })

  it("returns the user_id, token id and scopes for a valid, non-revoked token", async () => {
    const { verifyApiTokenByRaw } = await import("./api-token")
    lookupRow = {
      id: "tok-1",
      user_id: "user-1",
      revoked_at: null,
      scopes: ["read", "write"],
    }
    expect(await verifyApiTokenByRaw("qc_live_valid")).toEqual({
      userId: "user-1",
      tokenId: "tok-1",
      scopes: ["read", "write"],
    })
  })

  it("defaults scopes to [] when the column is null", async () => {
    const { verifyApiTokenByRaw } = await import("./api-token")
    lookupRow = {
      id: "tok-1",
      user_id: "user-1",
      revoked_at: null,
      scopes: null,
    }
    const result = await verifyApiTokenByRaw("qc_live_valid")
    expect(result?.scopes).toEqual([])
  })

  it("logs a warning and returns null (fail closed) when the lookup errors", async () => {
    const { verifyApiTokenByRaw } = await import("./api-token")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    lookupError = { message: "connection refused" }
    expect(await verifyApiTokenByRaw("qc_live_valid")).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      "api_tokens lookup failed:",
      "connection refused"
    )
    warn.mockRestore()
  })

  it("schedules the last_used_at touch via after() on the valid path", async () => {
    const { verifyApiTokenByRaw } = await import("./api-token")
    lookupRow = { id: "tok-1", user_id: "user-1", revoked_at: null }
    await verifyApiTokenByRaw("qc_live_valid")
    expect(after).toHaveBeenCalledOnce()
    // after() runs the deferred fn synchronously in this test, so the touch ran.
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe("tok-1")
    expect(updates[0].payload).toHaveProperty("last_used_at")
  })
})

describe("verifyApiToken return shape", () => {
  it("forwards { userId, tokenId, scopes } for a valid bearer token", async () => {
    const { verifyApiToken } = await import("./api-token")
    lookupRow = {
      id: "tok-1",
      user_id: "user-1",
      revoked_at: null,
      scopes: ["read"],
    }
    const req = new Request("https://x.test", {
      headers: { authorization: "Bearer qc_live_valid" },
    })
    expect(await verifyApiToken(req)).toEqual({
      userId: "user-1",
      tokenId: "tok-1",
      scopes: ["read"],
    })
  })
})

describe("consumeRateLimit", () => {
  it("maps an allowed v2 row to { allowed, remaining, resetSeconds }", async () => {
    const { consumeRateLimit } = await import("./api-token")
    rpcResult = {
      data: [{ allowed: true, remaining: 41, reset_seconds: 17 }],
      error: null,
    }
    expect(await consumeRateLimit("tok-1")).toEqual({
      allowed: true,
      remaining: 41,
      resetSeconds: 17,
    })
  })

  it("maps a denied v2 row to allowed: false", async () => {
    const { consumeRateLimit } = await import("./api-token")
    rpcResult = {
      data: [{ allowed: false, remaining: 0, reset_seconds: 9 }],
      error: null,
    }
    expect(await consumeRateLimit("tok-1")).toEqual({
      allowed: false,
      remaining: 0,
      resetSeconds: 9,
    })
  })

  it("calls the consume_api_rate_limit_v2 rpc with the token id, limit and window", async () => {
    const { consumeRateLimit, RATE_LIMIT, RATE_WINDOW_SECONDS } = await import(
      "./api-token"
    )
    rpcResult = {
      data: [{ allowed: true, remaining: 59, reset_seconds: 60 }],
      error: null,
    }
    await consumeRateLimit("tok-1")
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe("consume_api_rate_limit_v2")
    expect(rpcCalls[0].params).toEqual({
      p_token_id: "tok-1",
      p_limit: RATE_LIMIT,
      p_window_seconds: RATE_WINDOW_SECONDS,
    })
    expect(RATE_LIMIT).toBe(60)
    expect(RATE_WINDOW_SECONDS).toBe(60)
  })

  it("fails open with nulls when the rpc errors, so a limiter outage does not break the read API", async () => {
    const { consumeRateLimit } = await import("./api-token")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    rpcResult = { data: null, error: { message: "boom" } }
    expect(await consumeRateLimit("tok-1")).toEqual({
      allowed: true,
      remaining: null,
      resetSeconds: null,
    })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("fails open with nulls when the rpc returns no row", async () => {
    const { consumeRateLimit } = await import("./api-token")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    rpcResult = { data: [], error: null }
    expect(await consumeRateLimit("tok-1")).toEqual({
      allowed: true,
      remaining: null,
      resetSeconds: null,
    })
    warn.mockRestore()
  })
})
