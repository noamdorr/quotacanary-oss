import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth/api-token", () => ({
  verifyApiToken: vi.fn(),
  consumeRateLimit: vi.fn(),
  RATE_LIMIT: 60,
  RATE_WINDOW_SECONDS: 60,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ admin: true })),
}))

vi.mock("@/lib/connection-writes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/connection-writes")>()),
  prepareConnection: vi.fn(),
  insertConnectionForUser: vi.fn(),
  findConnectionByRequestId: vi.fn(),
  findConnectionWithSameKey: vi.fn(),
  seedPoolThresholds: vi.fn(),
}))

import { consumeRateLimit, verifyApiToken } from "@/lib/auth/api-token"
import {
  findConnectionByRequestId,
  findConnectionWithSameKey,
  insertConnectionForUser,
  prepareConnection,
  seedPoolThresholds,
} from "@/lib/connection-writes"

const mockVerify = vi.mocked(verifyApiToken)
const mockConsume = vi.mocked(consumeRateLimit)
const mockPrepare = vi.mocked(prepareConnection)
const mockInsert = vi.mocked(insertConnectionForUser)
const mockFind = vi.mocked(findConnectionByRequestId)
const mockSeed = vi.mocked(seedPoolThresholds)
const mockSameKey = vi.mocked(findConnectionWithSameKey)

const WRITE_TOKEN = {
  userId: "user-1",
  tokenId: "tok-1",
  scopes: ["read", "write"],
}
const READ_TOKEN = { userId: "user-1", tokenId: "tok-1", scopes: ["read"] }
const ALLOWED = { allowed: true, remaining: 59, resetSeconds: 42 }
const PREPARED = {
  toolId: "hunter",
  name: "Hunter",
  tags: [],
  watched: null,
  encryptedKey: "enc",
  keyHint: "-key",
  balances: [],
  summary: [],
}
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/v1/connections", {
    method: "POST",
    headers: { Authorization: "Bearer qc_live_test", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const GOOD_BODY = { toolId: "hunter", name: "Hunter", apiKey: "hunter-key" }

let POST: (req: NextRequest) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue(WRITE_TOKEN)
  mockConsume.mockResolvedValue(ALLOWED)
  mockPrepare.mockResolvedValue({ ok: true, prepared: PREPARED })
  mockInsert.mockResolvedValue({ ok: true, connectionId: "conn-new" })
  mockFind.mockResolvedValue(null)
  mockSameKey.mockResolvedValue(null)
  mockSeed.mockResolvedValue({ ok: true })
  const mod = await import("./route")
  POST = mod.POST
})

afterEach(() => {
  vi.resetModules()
})

describe("POST /api/v1/connections", () => {
  describe("gates", () => {
    it("returns 401 for a missing or invalid token", async () => {
      mockVerify.mockResolvedValue(null)
      const res = await POST(post(GOOD_BODY))
      expect(res.status).toBe(401)
      expect((await res.json()).error.code).toBe("unauthorized")
      expect(res.headers.get("WWW-Authenticate")).toBe("Bearer")
      expect(mockPrepare).not.toHaveBeenCalled()
    })

    it("returns 403 insufficient_scope for a read-only token, before spending budget", async () => {
      mockVerify.mockResolvedValue(READ_TOKEN)
      const res = await POST(post(GOOD_BODY))
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error.code).toBe("insufficient_scope")
      expect(body.error.message).toContain("write")
      expect(res.headers.get("WWW-Authenticate")).toBe(
        'Bearer error="insufficient_scope"'
      )
      expect(mockConsume).not.toHaveBeenCalled()
      expect(mockPrepare).not.toHaveBeenCalled()
    })

    it("returns 429 with Retry-After when over the shared limit", async () => {
      mockConsume.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetSeconds: 7,
      })
      const res = await POST(post(GOOD_BODY))
      expect(res.status).toBe(429)
      expect((await res.json()).error.code).toBe("rate_limited")
      expect(res.headers.get("Retry-After")).toBe("7")
      expect(mockPrepare).not.toHaveBeenCalled()
    })
  })

  describe("scopes header", () => {
    it("carries X-QuotaCanary-Scopes on 201, on a 400 after the gate, and on the 403, never on 401", async () => {
      const created = await POST(post(GOOD_BODY))
      expect(created.status).toBe(201)
      expect(created.headers.get("X-QuotaCanary-Scopes")).toBe("read write")

      const invalid = await POST(post({ name: "Hunter" }))
      expect(invalid.status).toBe(400)
      expect(invalid.headers.get("X-QuotaCanary-Scopes")).toBe("read write")

      mockVerify.mockResolvedValue(READ_TOKEN)
      const readOnly = await POST(post(GOOD_BODY))
      expect(readOnly.status).toBe(403)
      expect(readOnly.headers.get("X-QuotaCanary-Scopes")).toBe("read")

      mockVerify.mockResolvedValue(null)
      const anon = await POST(post(GOOD_BODY))
      expect(anon.status).toBe(401)
      expect(anon.headers.get("X-QuotaCanary-Scopes")).toBeNull()
    })
  })

  describe("body validation", () => {
    it("returns 400 invalid_body for malformed JSON", async () => {
      const res = await POST(post("{not json"))
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe("invalid_body")
    })

    it.each([
      ["missing toolId", { name: "Hunter", apiKey: "k" }],
      ["missing name", { toolId: "hunter", apiKey: "k" }],
      ["missing credential", { toolId: "hunter", name: "Hunter" }],
      ["non-string apiKey", { toolId: "hunter", name: "Hunter", apiKey: 1 }],
      ["malformed requestId", { ...GOOD_BODY, requestId: "nope" }],
      [
        "non-array watchedCreditTypes",
        { ...GOOD_BODY, watchedCreditTypes: "credits" },
      ],
    ])("returns 400 invalid_body for %s", async (_label, body) => {
      const res = await POST(post(body))
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe("invalid_body")
      expect(mockPrepare).not.toHaveBeenCalled()
    })
  })

  describe("vendor check", () => {
    it("returns the adapter's error as 422 key_rejected and inserts nothing", async () => {
      mockPrepare.mockResolvedValue({
        ok: false,
        code: "key_rejected",
        error: "Invalid API key",
      })
      const res = await POST(post(GOOD_BODY))
      expect(res.status).toBe(422)
      expect(await res.json()).toEqual({
        error: { code: "key_rejected", message: "Invalid API key" },
      })
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it("maps an unknown tool to 400 unsupported_tool", async () => {
      mockPrepare.mockResolvedValue({
        ok: false,
        code: "unsupported_tool",
        error: "This tool isn't supported yet.",
      })
      const res = await POST(post({ ...GOOD_BODY, toolId: "nope" }))
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe("unsupported_tool")
    })

    it("maps a validation failure from the shared writer to 400 invalid_body", async () => {
      mockPrepare.mockResolvedValue({
        ok: false,
        code: "invalid",
        error: "Choose at least one balance to track.",
      })
      const res = await POST(post(GOOD_BODY))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toEqual({
        code: "invalid_body",
        message: "Choose at least one balance to track.",
      })
    })
  })

  describe("happy path", () => {
    it("returns 201 { connectionId } and inserts for the TOKEN's user", async () => {
      const res = await POST(post({ ...GOOD_BODY, userId: "someone-else" }))
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ connectionId: "conn-new" })
      expect(res.headers.get("Cache-Control")).toBe("no-store")
      expect(res.headers.get("RateLimit-Remaining")).toBe("59")

      expect(mockPrepare).toHaveBeenCalledWith(
        { admin: true },
        {
          toolId: "hunter",
          name: "Hunter",
          tags: [],
          watchedCreditTypes: [],
          credential: "hunter-key",
        }
      )
      const [, userId, prepared, requestId] = mockInsert.mock.calls[0]
      expect(userId).toBe("user-1")
      expect(prepared).toBe(PREPARED)
      expect(requestId).toMatch(UUID)
    })

    it("honours a caller-supplied requestId so a retried move is idempotent", async () => {
      const requestId = "22222222-2222-4222-8222-222222222222"
      const res = await POST(post({ ...GOOD_BODY, requestId }))
      expect(res.status).toBe(201)
      expect(mockInsert.mock.calls[0][3]).toBe(requestId)
    })

    it("answers a retried requestId with 200 and the same connection, without a second vendor check", async () => {
      // The fake keeps what the first attempt saved, like the request-id index.
      const saved = new Map<string, string>()
      mockInsert.mockImplementation(async (_admin, _user, _prepared, id) => {
        saved.set(id, "conn-new")
        return { ok: true, connectionId: "conn-new" }
      })
      mockFind.mockImplementation(
        async (_admin, _user, id) => saved.get(id) ?? null
      )
      const requestId = "33333333-3333-4333-8333-333333333333"

      const first = await POST(post({ ...GOOD_BODY, requestId }))
      expect(first.status).toBe(201)
      const retry = await POST(post({ ...GOOD_BODY, requestId }))
      expect(retry.status).toBe(200)
      expect(await retry.json()).toEqual({ connectionId: "conn-new" })
      expect(retry.headers.get("Cache-Control")).toBe("no-store")

      expect(mockPrepare).toHaveBeenCalledTimes(1)
      expect(mockInsert).toHaveBeenCalledTimes(1)
      expect(mockFind).toHaveBeenLastCalledWith(
        { admin: true },
        "user-1",
        requestId
      )
    })

    it("answers a key this user already connected with 200 and that connection, without a vendor check (QUO-293)", async () => {
      // The fake keeps what each create saved, keyed by the plaintext key.
      const saved = new Map<string, string>()
      mockInsert.mockImplementation(async () => {
        saved.set("hunter-key", "conn-new")
        return { ok: true, connectionId: "conn-new" }
      })
      mockSameKey.mockImplementation(async (_admin, _user, _tool, key) => {
        const id = saved.get(String(key))
        return id ? { connectionId: id, name: "Hunter" } : null
      })

      const first = await POST(post(GOOD_BODY))
      expect(first.status).toBe(201)
      const second = await POST(post({ ...GOOD_BODY, name: "Hunter again" }))
      expect(second.status).toBe(200)
      expect(await second.json()).toEqual({
        connectionId: "conn-new",
        existing: true,
      })
      expect(mockPrepare).toHaveBeenCalledTimes(1)
      expect(mockInsert).toHaveBeenCalledTimes(1)
      expect(mockSeed).not.toHaveBeenCalled()
      expect(mockSameKey).toHaveBeenLastCalledWith(
        { admin: true },
        "user-1",
        "hunter",
        "hunter-key"
      )
    })

    it("creates a second connection for a different key", async () => {
      mockSameKey.mockResolvedValue(null)
      const res = await POST(post({ ...GOOD_BODY, apiKey: "other-key" }))
      expect(res.status).toBe(201)
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })

    it("does not look up a request id the caller did not send", async () => {
      await POST(post(GOOD_BODY))
      expect(mockFind).not.toHaveBeenCalled()
    })

    describe("thresholds (QUO-291)", () => {
      const THRESHOLDS = {
        verifications: { low: 500, critical: 166 },
        searches: { low: 90 },
      }
      const STORED = {
        verifications: { low: 500, critical: 166 },
        searches: { low: 90, critical: 30 },
      }

      it("validates them, hands them to the writer and seeds them onto the new connection", async () => {
        mockPrepare.mockResolvedValue({
          ok: true,
          prepared: { ...PREPARED, poolThresholds: STORED },
        })
        const res = await POST(post({ ...GOOD_BODY, thresholds: THRESHOLDS }))
        expect(res.status).toBe(201)
        // A missing critical is derived like the web drawer does.
        expect(mockPrepare.mock.calls[0][1].poolThresholds).toEqual(STORED)
        expect(mockSeed).toHaveBeenCalledWith(
          { admin: true },
          "user-1",
          "conn-new",
          STORED
        )
        // Seeded after the row exists, never before.
        expect(mockInsert.mock.invocationCallOrder[0]).toBeLessThan(
          mockSeed.mock.invocationCallOrder[0]
        )
      })

      it("writes nothing extra when none are sent", async () => {
        await POST(post(GOOD_BODY))
        expect(mockPrepare.mock.calls[0][1].poolThresholds).toBeUndefined()
        expect(mockSeed).not.toHaveBeenCalled()
      })

      it("returns 400 invalid_body for a bad shape or number, before the vendor check", async () => {
        for (const thresholds of [
          [],
          "500",
          { verifications: 500 },
          { verifications: { low: 0 } },
          { verifications: { low: 500, critical: 600 } },
        ]) {
          const res = await POST(post({ ...GOOD_BODY, thresholds }))
          expect(res.status, JSON.stringify(thresholds)).toBe(400)
          expect((await res.json()).error.code).toBe("invalid_body")
        }
        expect(mockPrepare).not.toHaveBeenCalled()
      })

      it("returns 400 for a credit type the tool does not have", async () => {
        mockPrepare.mockResolvedValue({
          ok: false,
          code: "invalid",
          error: "Unknown credit pool for this tool.",
        })
        const res = await POST(
          post({ ...GOOD_BODY, thresholds: { minutes: { low: 5 } } })
        )
        expect(res.status).toBe(400)
        expect((await res.json()).error.message).toBe(
          "Unknown credit pool for this tool."
        )
        expect(mockInsert).not.toHaveBeenCalled()
        expect(mockSeed).not.toHaveBeenCalled()
      })

      it("still answers 201 when only the threshold write fails, so the move is not repeated", async () => {
        mockPrepare.mockResolvedValue({
          ok: true,
          prepared: { ...PREPARED, poolThresholds: STORED },
        })
        mockSeed.mockResolvedValue({
          ok: false,
          code: "db",
          error: "Couldn't save the thresholds.",
        })
        const res = await POST(post({ ...GOOD_BODY, thresholds: THRESHOLDS }))
        expect(res.status).toBe(201)
        expect(await res.json()).toEqual({ connectionId: "conn-new" })
      })

      it("leaves the retried-request-id answer as it was: 200, no vendor check, no second write", async () => {
        mockFind.mockResolvedValue("conn-new")
        const res = await POST(
          post({
            ...GOOD_BODY,
            thresholds: THRESHOLDS,
            requestId: "44444444-4444-4444-8444-444444444444",
          })
        )
        expect(res.status).toBe(200)
        expect(mockPrepare).not.toHaveBeenCalled()
        expect(mockSeed).not.toHaveBeenCalled()
      })
    })

    it("passes watchedCreditTypes through for multi-pool tools", async () => {
      await POST(post({ ...GOOD_BODY, watchedCreditTypes: ["credits"] }))
      expect(mockPrepare.mock.calls[0][1].watchedCreditTypes).toEqual([
        "credits",
      ])
    })

    it("accepts a credentials object for tools with several fields", async () => {
      await POST(
        post({
          toolId: "multi",
          name: "Multi",
          credentials: { apiKey: "k", secret: "s" },
        })
      )
      const credential = mockPrepare.mock.calls[0][1].credential
      expect(credential).toBeInstanceOf(FormData)
      expect((credential as FormData).get("apiKey")).toBe("k")
      expect((credential as FormData).get("credential_secret")).toBe("s")
    })

    it("returns 500 internal when the insert fails", async () => {
      mockInsert.mockResolvedValue({
        ok: false,
        code: "db",
        error: "Couldn't save the connection. Please try again.",
      })
      const res = await POST(post(GOOD_BODY))
      expect(res.status).toBe(500)
      expect((await res.json()).error.code).toBe("internal")
    })
  })
})
