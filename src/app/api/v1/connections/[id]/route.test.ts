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
  findOwnedConnection: vi.fn(),
  rekeyOwnedConnection: vi.fn(),
  renameOwnedConnection: vi.fn(),
  removeOwnedConnection: vi.fn(),
}))

import { consumeRateLimit, verifyApiToken } from "@/lib/auth/api-token"
import {
  findOwnedConnection,
  rekeyOwnedConnection,
  removeOwnedConnection,
  renameOwnedConnection,
} from "@/lib/connection-writes"

const mockVerify = vi.mocked(verifyApiToken)
const mockConsume = vi.mocked(consumeRateLimit)
const mockFind = vi.mocked(findOwnedConnection)
const mockRekey = vi.mocked(rekeyOwnedConnection)
const mockRename = vi.mocked(renameOwnedConnection)
const mockRemove = vi.mocked(removeOwnedConnection)

const WRITE_TOKEN = {
  userId: "user-1",
  tokenId: "tok-1",
  scopes: ["read", "write"],
}
const READ_TOKEN = { userId: "user-1", tokenId: "tok-1", scopes: ["read"] }
const ALLOWED = { allowed: true, remaining: 59, resetSeconds: 42 }
const CONN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ADMIN = { admin: true }

type Ctx = { params: Promise<{ id: string }> }
const ctx = (id = CONN_ID): Ctx => ({ params: Promise.resolve({ id }) })

function request(method: "PATCH" | "DELETE", body?: unknown) {
  return new NextRequest(`http://localhost/api/v1/connections/${CONN_ID}`, {
    method,
    headers: { Authorization: "Bearer qc_live_test" },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  })
}

let PATCH: (req: NextRequest, ctx: Ctx) => Promise<Response>
let DELETE: (req: NextRequest, ctx: Ctx) => Promise<Response>

beforeEach(async () => {
  vi.clearAllMocks()
  mockVerify.mockResolvedValue(WRITE_TOKEN)
  mockConsume.mockResolvedValue(ALLOWED)
  mockFind.mockResolvedValue(true)
  mockRekey.mockResolvedValue({ ok: true })
  mockRename.mockResolvedValue({ ok: true })
  mockRemove.mockResolvedValue({ ok: true })
  const mod = await import("./route")
  PATCH = mod.PATCH
  DELETE = mod.DELETE
})

afterEach(() => {
  vi.resetModules()
})

describe("PATCH /api/v1/connections/:id", () => {
  it("returns 401 for a missing or invalid token", async () => {
    mockVerify.mockResolvedValue(null)
    const res = await PATCH(request("PATCH", { name: "New" }), ctx())
    expect(res.status).toBe(401)
    expect(mockFind).not.toHaveBeenCalled()
  })

  it("returns 403 insufficient_scope for a read-only token", async () => {
    mockVerify.mockResolvedValue(READ_TOKEN)
    const res = await PATCH(request("PATCH", { name: "New" }), ctx())
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe("insufficient_scope")
    expect(mockConsume).not.toHaveBeenCalled()
    expect(mockFind).not.toHaveBeenCalled()
  })

  it("returns 404 (never 403) for a connection the user does not own, touching nothing", async () => {
    mockFind.mockResolvedValue(false)
    const res = await PATCH(request("PATCH", { name: "New" }), ctx())
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe("not_found")
    expect(mockFind).toHaveBeenCalledWith(ADMIN, "user-1", CONN_ID)
    expect(mockRename).not.toHaveBeenCalled()
    expect(mockRekey).not.toHaveBeenCalled()
  })

  it("returns 400 invalid_body when neither name nor a credential is given", async () => {
    const res = await PATCH(request("PATCH", {}), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
    expect(mockRename).not.toHaveBeenCalled()
  })

  it("returns 400 invalid_body for malformed JSON", async () => {
    const res = await PATCH(request("PATCH", "{nope"), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
  })

  it("renames through the owner-scoped writer with the token's user id", async () => {
    const res = await PATCH(request("PATCH", { name: "Renamed" }), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connectionId: CONN_ID })
    expect(mockRename).toHaveBeenCalledWith(ADMIN, "user-1", CONN_ID, "Renamed")
    expect(mockRekey).not.toHaveBeenCalled()
    expect(res.headers.get("RateLimit-Remaining")).toBe("59")
  })

  it("rekeys through the owner-scoped writer, admin client on both sides", async () => {
    const res = await PATCH(request("PATCH", { apiKey: "new-key" }), ctx())
    expect(res.status).toBe(200)
    expect(mockRekey).toHaveBeenCalledWith(
      ADMIN,
      ADMIN,
      "user-1",
      CONN_ID,
      "new-key"
    )
    expect(mockRename).not.toHaveBeenCalled()
  })

  it("returns the adapter's error as 422 key_rejected on a bad key", async () => {
    mockRekey.mockResolvedValue({
      ok: false,
      code: "key_rejected",
      error: "Invalid API key",
    })
    const res = await PATCH(request("PATCH", { apiKey: "bad" }), ctx())
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: { code: "key_rejected", message: "Invalid API key" },
    })
  })

  it("applies the key before the name and stops if the key fails", async () => {
    mockRekey.mockResolvedValue({
      ok: false,
      code: "key_rejected",
      error: "Invalid API key",
    })
    const res = await PATCH(
      request("PATCH", { apiKey: "bad", name: "Renamed" }),
      ctx()
    )
    expect(res.status).toBe(422)
    expect(mockRename).not.toHaveBeenCalled()
  })

  it("applies both when both are given", async () => {
    const res = await PATCH(
      request("PATCH", { apiKey: "new-key", name: "Renamed" }),
      ctx()
    )
    expect(res.status).toBe(200)
    expect(mockRekey).toHaveBeenCalledOnce()
    expect(mockRename).toHaveBeenCalledOnce()
  })

  it("maps a rejected name to 400 invalid_body with the writer's message", async () => {
    mockRename.mockResolvedValue({
      ok: false,
      code: "invalid",
      error: "That name is too long (80 characters max).",
    })
    const res = await PATCH(request("PATCH", { name: "x".repeat(81) }), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toEqual({
      code: "invalid_body",
      message: "That name is too long (80 characters max).",
    })
  })
})

describe("X-QuotaCanary-Scopes on the id routes", () => {
  it("rides on PATCH 200, PATCH 404 and DELETE 204", async () => {
    const renamed = await PATCH(request("PATCH", { name: "New" }), ctx())
    expect(renamed.status).toBe(200)
    expect(renamed.headers.get("X-QuotaCanary-Scopes")).toBe("read write")

    mockFind.mockResolvedValue(false)
    const missing = await PATCH(request("PATCH", { name: "New" }), ctx())
    expect(missing.status).toBe(404)
    expect(missing.headers.get("X-QuotaCanary-Scopes")).toBe("read write")

    mockFind.mockResolvedValue(true)
    const removed = await DELETE(request("DELETE"), ctx())
    expect(removed.status).toBe(204)
    expect(removed.headers.get("X-QuotaCanary-Scopes")).toBe("read write")
  })
})

describe("DELETE /api/v1/connections/:id", () => {
  it("returns 401 for a missing or invalid token", async () => {
    mockVerify.mockResolvedValue(null)
    const res = await DELETE(request("DELETE"), ctx())
    expect(res.status).toBe(401)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("returns 403 insufficient_scope for a read-only token", async () => {
    mockVerify.mockResolvedValue(READ_TOKEN)
    const res = await DELETE(request("DELETE"), ctx())
    expect(res.status).toBe(403)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("returns 404 for another user's connection and deletes nothing", async () => {
    mockFind.mockResolvedValue(false)
    const res = await DELETE(request("DELETE"), ctx())
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe("not_found")
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it("returns 204 and removes through the owner-scoped writer", async () => {
    const res = await DELETE(request("DELETE"), ctx())
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    expect(res.headers.get("RateLimit-Remaining")).toBe("59")
    expect(mockRemove).toHaveBeenCalledWith(ADMIN, "user-1", CONN_ID)
  })

  it("returns 500 internal when the delete fails", async () => {
    mockRemove.mockResolvedValue({
      ok: false,
      code: "db",
      error: "Couldn't remove the connection.",
    })
    const res = await DELETE(request("DELETE"), ctx())
    expect(res.status).toBe(500)
    expect((await res.json()).error.code).toBe("internal")
  })
})
