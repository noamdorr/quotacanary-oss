import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Module mocks (hoisted so they run before the route import resolves)
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth/api-token", () => ({
  verifyApiToken: vi.fn(),
  consumeRateLimit: vi.fn(),
  RATE_LIMIT: 60,
  RATE_WINDOW_SECONDS: 60,
}))

vi.mock("@/lib/db/connections", () => ({
  listConnectionsWithBalance: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}))

import {
  RATE_LIMIT,
  RATE_WINDOW_SECONDS,
  consumeRateLimit,
  verifyApiToken,
} from "@/lib/auth/api-token"
import { listConnectionsWithBalance } from "@/lib/db/connections"
import { createAdminClient } from "@/lib/supabase/admin"

const mockVerify = vi.mocked(verifyApiToken)
const mockConsume = vi.mocked(consumeRateLimit)
const mockList = vi.mocked(listConnectionsWithBalance)
const mockAdmin = vi.mocked(createAdminClient)

// ---------------------------------------------------------------------------
// Fixtures: minimal ConnectionWithBalance objects that produce distinct statuses
// when run through the real serializePoolRow. We keep them structurally valid
// by providing all fields serializePoolRow touches.
// ---------------------------------------------------------------------------
import type { ConnectionWithBalance } from "@/lib/types"

function makeConnection(
  id: string,
  name: string,
  status: ConnectionWithBalance["status"],
  balance: number | null = 1000
): ConnectionWithBalance {
  return {
    id,
    user_id: "user-1",
    tool_id: "tool-1",
    connection_type: "api",
    encrypted_key: null,
    key_hint: "xxxx",
    name,
    tags: [],
    status,
    alert_enabled: false,
    alert_threshold: null,
    low_threshold: null,
    alert_fired_at: null,
    notified_level: "none",
    last_error: null,
    consecutive_failures: 0,
    watched_credit_types: null,
    pool_thresholds: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tool: {
      id: "tool-1",
      name: "Test Tool",
      logo_url: null,
      topup_url: null,
      default_low_threshold: 100,
      default_alert_threshold: 50,
      pools: null,
      credential_fields: [],
    },
    pools:
      balance !== null
        ? [
            {
              creditType: "credits",
              label: "Credits",
              unit: "credits",
              balance,
              balanceLimit: null,
              recorded_at: new Date().toISOString(),
              history: [],
            },
          ]
        : [],
  }
}

// One "healthy" connection (high balance) and one with no pools (nodata).
const HEALTHY_CONN = makeConnection("conn-1", "Healthy Tool", "active", 9999)
const NODATA_CONN = makeConnection("conn-2", "No Data Tool", "active", null)

function makeRequest(
  url = "http://localhost/api/v1/pools",
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, { headers })
}

function bearerRequest(
  token: string,
  params?: Record<string, string>
): NextRequest {
  let url = "http://localhost/api/v1/pools"
  if (params) {
    const qs = new URLSearchParams(params)
    url = `${url}?${qs}`
  }
  return new NextRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Import GET after mocks are registered.
// Dynamic import in beforeEach avoids hoisting issues.
let GET: (req: NextRequest) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  // Default: admin client mock returns a stub supabase-like object
  mockAdmin.mockReturnValue({} as ReturnType<typeof createAdminClient>)
  const mod = await import("./route")
  GET = mod.GET
})

afterEach(() => {
  vi.resetModules()
})

// ---------------------------------------------------------------------------
describe("GET /api/v1/pools", () => {
  // -------------------------------------------------------------------------
  describe("authentication", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      mockVerify.mockResolvedValue(null)
      const res = await GET(makeRequest())
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.code).toBe("unauthorized")
      expect(res.headers.get("WWW-Authenticate")).toBe("Bearer")
    })

    it("returns 401 when token is invalid", async () => {
      mockVerify.mockResolvedValue(null)
      const res = await GET(
        makeRequest("http://localhost/api/v1/pools", {
          Authorization: "Bearer bad_token",
        })
      )
      expect(res.status).toBe(401)
      expect(res.headers.get("WWW-Authenticate")).toBe("Bearer")
    })

    it("does NOT call listConnectionsWithBalance when auth fails", async () => {
      mockVerify.mockResolvedValue(null)
      await GET(makeRequest())
      expect(mockList).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  describe("data layer errors", () => {
    it("returns 500 (JSON) when listConnectionsWithBalance throws", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      mockList.mockRejectedValue(new Error("connection refused"))
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error.code).toBe("internal")
    })
  })

  // -------------------------------------------------------------------------
  describe("scope check", () => {
    it("returns 403 insufficient_scope when the token lacks the read scope", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: [],
      })
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe("insufficient_scope")
      expect(res.headers.get("WWW-Authenticate")).toBe(
        'Bearer error="insufficient_scope"'
      )
      // Scope is checked before the rate limit budget is spent.
      expect(mockConsume).not.toHaveBeenCalled()
      expect(mockList).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetSeconds: 7,
      })
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error.code).toBe("rate_limited")
      // Retry-After / RateLimit-Reset carry the limiter's real resetSeconds.
      expect(res.headers.get("Retry-After")).toBe("7")
      expect(res.headers.get("RateLimit-Limit")).toBe(String(RATE_LIMIT))
      expect(res.headers.get("RateLimit-Remaining")).toBe("0")
      expect(res.headers.get("RateLimit-Reset")).toBe("7")
    })

    it("falls back to the window size in Retry-After when resetSeconds is unknown", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetSeconds: null,
      })
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.status).toBe(429)
      expect(res.headers.get("Retry-After")).toBe(String(RATE_WINDOW_SECONDS))
      expect(res.headers.get("RateLimit-Reset")).toBe(
        String(RATE_WINDOW_SECONDS)
      )
    })

    it("does NOT call listConnectionsWithBalance when rate limited", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetSeconds: 7,
      })
      await GET(bearerRequest("qc_live_test"))
      expect(mockList).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  describe("status filter validation", () => {
    it("returns 400 for an unknown status value", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      const res = await GET(bearerRequest("qc_live_test", { status: "bogus" }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe("invalid_status")
    })

    it("returns 400 for a partially invalid comma-list", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      const res = await GET(
        bearerRequest("qc_live_test", { status: "healthy,bogus" })
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe("invalid_status")
    })

    it("returns 400 for status=disconnected (no longer an accepted filter value)", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      const res = await GET(
        bearerRequest("qc_live_test", { status: "disconnected" })
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe("invalid_status")
    })
  })

  // -------------------------------------------------------------------------
  describe("successful response", () => {
    beforeEach(() => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      mockList.mockResolvedValue([HEALTHY_CONN, NODATA_CONN])
    })

    it("returns 200 with { pools: [...] } for a valid token", async () => {
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty("pools")
      expect(Array.isArray(body.pools)).toBe(true)
      // HEALTHY_CONN has one pool, NODATA_CONN has zero pools -> one placeholder row
      expect(body.pools).toHaveLength(2)
    })

    it("calls listConnectionsWithBalance with the token's userId (NOT any query param)", async () => {
      await GET(bearerRequest("qc_live_test"))
      expect(mockList).toHaveBeenCalledOnce()
      const [, calledUserId] = mockList.mock.calls[0]
      expect(calledUserId).toBe("user-1")
    })

    it("sets RateLimit-Limit/Remaining/Reset on a 200", async () => {
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.status).toBe(200)
      expect(res.headers.get("RateLimit-Limit")).toBe(String(RATE_LIMIT))
      expect(res.headers.get("RateLimit-Remaining")).toBe("59")
      expect(res.headers.get("RateLimit-Reset")).toBe("42")
    })

    it("omits RateLimit-Remaining/Reset when the limiter failed open (nulls)", async () => {
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: null,
        resetSeconds: null,
      })
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.status).toBe(200)
      expect(res.headers.get("RateLimit-Limit")).toBe(String(RATE_LIMIT))
      expect(res.headers.get("RateLimit-Remaining")).toBeNull()
      expect(res.headers.get("RateLimit-Reset")).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  describe("TENANCY GUARD", () => {
    it("ignores ?user_id= query param and uses the token userId", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      mockList.mockResolvedValue([HEALTHY_CONN])

      // An attacker supplies someone else's user id in the query string
      const res = await GET(
        bearerRequest("qc_live_test", { user_id: "someone-else" })
      )

      expect(res.status).toBe(200)
      // CRITICAL: the data layer must be called with the TOKEN's user, not the attacker's value
      expect(mockList).toHaveBeenCalledOnce()
      const [, calledUserId] = mockList.mock.calls[0]
      expect(calledUserId).toBe("user-1")
      expect(calledUserId).not.toBe("someone-else")
    })
  })

  // -------------------------------------------------------------------------
  describe("status filter", () => {
    beforeEach(() => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      // Two connections: one healthy (high balance), one nodata (no pools)
      mockList.mockResolvedValue([HEALTHY_CONN, NODATA_CONN])
    })

    it("returns all pools when no status filter is provided", async () => {
      const res = await GET(bearerRequest("qc_live_test"))
      const body = await res.json()
      expect(body.pools).toHaveLength(2)
    })

    it("filters pools to only the requested status", async () => {
      // HEALTHY_CONN serializes to "healthy"; NODATA_CONN to "nodata"
      const res = await GET(bearerRequest("qc_live_test", { status: "nodata" }))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Only the nodata row should pass through
      expect(body.pools).toHaveLength(1)
      expect(body.pools[0].status).toBe("nodata")
    })

    it("?status=low returns only low-balance pools", async () => {
      // Add a low-balance connection (balance below default 100 low threshold)
      const lowConn = makeConnection("conn-3", "Low Tool", "active", 50)
      mockList.mockResolvedValue([HEALTHY_CONN, lowConn])
      const res = await GET(bearerRequest("qc_live_test", { status: "low" }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(
        body.pools.every((p: { status: string }) => p.status === "low")
      ).toBe(true)
    })

    it("accepts comma-separated status values", async () => {
      const res = await GET(
        bearerRequest("qc_live_test", { status: "healthy,nodata" })
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pools).toHaveLength(2)
    })
  })

  // -------------------------------------------------------------------------
  describe("Cache-Control header", () => {
    it("sets Cache-Control: no-store on success", async () => {
      mockVerify.mockResolvedValue({
        userId: "user-1",
        tokenId: "tok-1",
        scopes: ["read"],
      })
      mockConsume.mockResolvedValue({
        allowed: true,
        remaining: 59,
        resetSeconds: 42,
      })
      mockList.mockResolvedValue([])
      const res = await GET(bearerRequest("qc_live_test"))
      expect(res.headers.get("Cache-Control")).toBe("no-store")
    })
  })
})
