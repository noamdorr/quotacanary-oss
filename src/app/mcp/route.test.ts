import { consumeRateLimit, verifyApiTokenByRaw } from "@/lib/auth/api-token"
import { listConnectionsWithBalance } from "@/lib/db/connections"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Keep the real route, auth wrapper, transport, SDK and tool registration.
// Only replace the database boundary; these checks use no real credentials.
vi.mock("@/lib/auth/api-token", () => ({
  verifyApiTokenByRaw: vi.fn(),
  consumeRateLimit: vi.fn(),
}))
vi.mock("@/lib/db/connections", () => ({
  listConnectionsWithBalance: vi.fn(),
}))
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}))

import { POST } from "./route"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyApiTokenByRaw).mockImplementation(async (token) => {
    if (!token.startsWith("reader-")) return null
    const suffix = token.slice("reader-".length)
    return {
      userId: `user-${suffix}`,
      tokenId: `token-${suffix}`,
      scopes: ["read"],
    }
  })
  vi.mocked(consumeRateLimit).mockResolvedValue({
    allowed: true,
    remaining: 59,
    resetSeconds: 60,
  })
  vi.mocked(listConnectionsWithBalance).mockResolvedValue([])
})

function request(
  method: string,
  params = {},
  token: string | null = "reader-a"
) {
  return POST(
    new Request("https://app.quotacanary.com/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  )
}

async function rpc(method: string, params = {}, token = "reader-a") {
  const response = await request(method, params, token)
  expect(response.status).toBe(200)
  const body = await response.text()
  const data = body.split("\n").find((line) => line.startsWith("data: "))
  return JSON.parse(data ? data.slice(6) : body)
}

describe("real MCP HTTP transport compatibility", () => {
  it.each([null, "invalid"])(
    "rejects an unauthorized token: %s",
    async (token) => {
      const response = await request("tools/list", {}, token)
      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toContain("Bearer")
      expect(listConnectionsWithBalance).not.toHaveBeenCalled()
    }
  )

  it("rejects a valid token without read scope", async () => {
    vi.mocked(verifyApiTokenByRaw).mockResolvedValue({
      userId: "user-a",
      tokenId: "token-a",
      scopes: [],
    })
    const response = await request("tools/list")
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: "insufficient_scope" })
    expect(listConnectionsWithBalance).not.toHaveBeenCalled()
  })

  it("initializes and lists both tools with their schemas", async () => {
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "transport-test", version: "1.0.0" },
    })
    expect(initialized.result.serverInfo.name).toBe("QuotaCanary")
    const listed = await rpc("tools/list")
    expect(listed.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "list_balances",
          inputSchema: expect.any(Object),
        }),
        expect.objectContaining({
          name: "get_tool_balance",
          outputSchema: expect.any(Object),
        }),
      ])
    )
    expect(listed.result.tools).toHaveLength(2)
  })

  it("preserves separate authenticated identities on concurrent tool calls", async () => {
    const results = await Promise.all(
      ["reader-a", "reader-b"].map((token) =>
        rpc(
          "tools/call",
          { name: "list_balances", arguments: { userId: "spoofed" } },
          token
        )
      )
    )
    for (const result of results) {
      expect(result.result.isError).not.toBe(true)
      expect(result.result.structuredContent).toEqual({ pools: [] })
    }
    expect(consumeRateLimit).toHaveBeenCalledWith("token-a")
    expect(consumeRateLimit).toHaveBeenCalledWith("token-b")
    expect(listConnectionsWithBalance).toHaveBeenCalledTimes(2)
    expect(listConnectionsWithBalance).toHaveBeenCalledWith(
      expect.anything(),
      "user-a"
    )
    expect(listConnectionsWithBalance).toHaveBeenCalledWith(
      expect.anything(),
      "user-b"
    )
  })

  it("keeps tool rate limiting effective through the transport", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetSeconds: 60,
    })
    const result = await rpc("tools/call", {
      name: "get_tool_balance",
      arguments: { toolName: "Hunter" },
    })
    expect(result.result.isError).toBe(true)
    expect(result.result.content[0].text).toContain("Rate limited")
    expect(listConnectionsWithBalance).not.toHaveBeenCalled()
  })

  it("rejects invalid tool arguments before touching the data layer", async () => {
    const result = await rpc("tools/call", {
      name: "get_tool_balance",
      arguments: { toolName: 123 },
    })
    expect(result.result.isError).toBe(true)
    expect(consumeRateLimit).not.toHaveBeenCalled()
    expect(listConnectionsWithBalance).not.toHaveBeenCalled()
  })
})
