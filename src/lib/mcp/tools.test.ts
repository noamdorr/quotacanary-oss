import type { ConnectionWithBalance } from "@/lib/types"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Module mocks (hoisted so they run before tools.ts import resolves)
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth/api-token", () => ({
  consumeRateLimit: vi.fn(),
}))

vi.mock("@/lib/db/connections", () => ({
  listConnectionsWithBalance: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}))

import { consumeRateLimit } from "@/lib/auth/api-token"
import { listConnectionsWithBalance } from "@/lib/db/connections"
import { createAdminClient } from "@/lib/supabase/admin"

const mockConsume = vi.mocked(consumeRateLimit)
const mockList = vi.mocked(listConnectionsWithBalance)
const mockAdmin = vi.mocked(createAdminClient)

// ---------------------------------------------------------------------------
// Fixtures: minimal ConnectionWithBalance objects that produce distinct
// statuses when run through the real serializePoolRow.
// ---------------------------------------------------------------------------

function makeConnection(
  id: string,
  name: string,
  toolName: string,
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
      name: toolName,
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

const APOLLO_CONN = makeConnection(
  "conn-1",
  "My Apollo",
  "Apollo",
  "active",
  9999
)
// balance 75: below the default low threshold (100) but above critical (50),
// so it serializes to "low" (not "critical").
const HUNTER_CONN = makeConnection("conn-2", "Hunter", "Hunter", "active", 75)
const NODATA_CONN = makeConnection(
  "conn-3",
  "Quiet Tool",
  "Clay",
  "active",
  null
)

// ---------------------------------------------------------------------------
// Fake server: records each registered tool's config + handler so we can
// invoke the handler directly with (args, extra) - no HTTP, no transport.
// ---------------------------------------------------------------------------

type ToolConfig = {
  description?: string
  inputSchema?: unknown
  outputSchema?: unknown
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean }
}
type ToolHandler = (
  args: Record<string, unknown>,
  extra: unknown
) => Promise<{
  content: { type: string; text: string }[]
  structuredContent?: { pools: unknown[] }
  isError?: boolean
}>

function makeFakeServer() {
  const tools = new Map<string, { config: ToolConfig; handler: ToolHandler }>()
  const server = {
    registerTool(name: string, config: ToolConfig, handler: ToolHandler) {
      tools.set(name, { config, handler })
    },
  }
  return { server, tools }
}

const EXTRA = { authInfo: { extra: { userId: "user-1", tokenId: "tok-1" } } }

// Import after mocks are registered.
let registerQuotaCanaryTools: typeof import("./tools").registerQuotaCanaryTools

beforeEach(async () => {
  vi.clearAllMocks()
  mockAdmin.mockReturnValue({} as ReturnType<typeof createAdminClient>)
  const mod = await import("./tools")
  registerQuotaCanaryTools = mod.registerQuotaCanaryTools
})

afterEach(() => {
  vi.resetModules()
})

function register() {
  const { server, tools } = makeFakeServer()
  // The fake only implements registerTool, which is all we exercise here.
  registerQuotaCanaryTools(
    server as unknown as Parameters<typeof registerQuotaCanaryTools>[0]
  )
  return tools
}

// Invokes a registered tool's handler directly with (args, extra). Throws a
// clear error if the tool was never registered (avoids non-null assertions).
function callTool(
  tools: ReturnType<typeof register>,
  name: string,
  args: Record<string, unknown>
) {
  const entry = tools.get(name)
  if (!entry) throw new Error(`tool not registered: ${name}`)
  return entry.handler(args, EXTRA)
}

// ---------------------------------------------------------------------------
describe("registerQuotaCanaryTools", () => {
  it("registers both list_balances and get_tool_balance", () => {
    const tools = register()
    expect(tools.has("list_balances")).toBe(true)
    expect(tools.has("get_tool_balance")).toBe(true)
  })

  it("registers both tools as read-only (readOnlyHint: true)", () => {
    const tools = register()
    expect(tools.get("list_balances")?.config.annotations?.readOnlyHint).toBe(
      true
    )
    expect(
      tools.get("get_tool_balance")?.config.annotations?.readOnlyHint
    ).toBe(true)
  })

  it("declares both tools as closed-world (openWorldHint: false)", () => {
    const tools = register()
    expect(tools.get("list_balances")?.config.annotations?.openWorldHint).toBe(
      false
    )
    expect(
      tools.get("get_tool_balance")?.config.annotations?.openWorldHint
    ).toBe(false)
  })

  it("defines an outputSchema on both tools", () => {
    const tools = register()
    expect(tools.get("list_balances")?.config.outputSchema).toBeDefined()
    expect(tools.get("get_tool_balance")?.config.outputSchema).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
describe("list_balances", () => {
  it("happy path: returns serialized pools + a non-empty text digest", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockResolvedValue([APOLLO_CONN, NODATA_CONN])

    const tools = register()
    const res = await callTool(tools, "list_balances", {})

    expect(res.isError).toBeFalsy()
    expect(res.structuredContent?.pools).toHaveLength(2)
    expect(res.content[0].type).toBe("text")
    expect(res.content[0].text.length).toBeGreaterThan(0)
    // Names of the connected tools should surface in the digest.
    expect(res.content[0].text).toContain("Apollo")
  })

  it("calls listConnectionsWithBalance with the token userId (tenancy)", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockResolvedValue([APOLLO_CONN])

    const tools = register()
    await callTool(tools, "list_balances", {})

    expect(mockList).toHaveBeenCalledOnce()
    const [, calledUserId] = mockList.mock.calls[0]
    expect(calledUserId).toBe("user-1")
  })

  it("digest never uses an em dash", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockResolvedValue([APOLLO_CONN, HUNTER_CONN, NODATA_CONN])

    const tools = register()
    const res = await callTool(tools, "list_balances", {})
    expect(res.content[0].text).not.toContain("—")
  })

  it("renders a friendly line when no tools are connected", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockResolvedValue([])

    const tools = register()
    const res = await callTool(tools, "list_balances", {})
    expect(res.isError).toBeFalsy()
    expect(res.structuredContent?.pools).toHaveLength(0)
    expect(res.content[0].text).toMatch(/no tools connected/i)
  })

  it("is rate-limited: returns isError and does NOT fetch data", async () => {
    mockConsume.mockResolvedValue(false)

    const tools = register()
    const res = await callTool(tools, "list_balances", {})

    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/rate limit/i)
    expect(mockList).not.toHaveBeenCalled()
  })

  it("invalid status: returns isError and does NOT fetch data", async () => {
    mockConsume.mockResolvedValue(true)

    const tools = register()
    const res = await callTool(tools, "list_balances", { status: "bogus" })

    expect(res.isError).toBe(true)
    expect(mockList).not.toHaveBeenCalled()
  })

  it("filters by a valid status value", async () => {
    mockConsume.mockResolvedValue(true)
    // APOLLO healthy (9999), HUNTER low (75: under low 100, over critical 50)
    mockList.mockResolvedValue([APOLLO_CONN, HUNTER_CONN])

    const tools = register()
    const res = await callTool(tools, "list_balances", { status: "low" })

    expect(res.isError).toBeFalsy()
    const pools = res.structuredContent?.pools as { status: string }[]
    expect(pools.length).toBeGreaterThan(0)
    expect(pools.every((p) => p.status === "low")).toBe(true)
  })

  it("returns isError text when the data layer throws", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockRejectedValue(new Error("connection refused"))

    const tools = register()
    const res = await callTool(tools, "list_balances", {})
    expect(res.isError).toBe(true)
    expect(res.content[0].type).toBe("text")
  })
})

// ---------------------------------------------------------------------------
describe("get_tool_balance", () => {
  it("filters to the named tool (case-insensitive)", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockResolvedValue([APOLLO_CONN, HUNTER_CONN])

    const tools = register()
    const res = await callTool(tools, "get_tool_balance", {
      toolName: "apollo",
    })

    expect(res.isError).toBeFalsy()
    const pools = res.structuredContent?.pools as {
      tool: { name: string }
    }[]
    expect(pools).toHaveLength(1)
    expect(pools[0].tool.name).toBe("Apollo")
    expect(res.content[0].text).toContain("Apollo")
  })

  it("returns a clear message when no tool matches", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockResolvedValue([APOLLO_CONN, HUNTER_CONN])

    const tools = register()
    const res = await callTool(tools, "get_tool_balance", {
      toolName: "Salesforce",
    })

    expect(res.structuredContent?.pools).toHaveLength(0)
    expect(res.content[0].text).toMatch(/no connected tool named/i)
    expect(res.content[0].text).toContain("Salesforce")
  })

  it("rejects an empty/whitespace toolName before fetching", async () => {
    mockConsume.mockResolvedValue(true)
    mockList.mockResolvedValue([APOLLO_CONN, HUNTER_CONN])

    const tools = register()
    const res = await callTool(tools, "get_tool_balance", { toolName: "   " })

    expect(res.isError).toBe(true)
    expect(res.structuredContent?.pools).toHaveLength(0)
    expect(mockList).not.toHaveBeenCalled()
  })

  it("is rate-limited: returns isError and does NOT fetch data", async () => {
    mockConsume.mockResolvedValue(false)

    const tools = register()
    const res = await callTool(tools, "get_tool_balance", {
      toolName: "Apollo",
    })

    expect(res.isError).toBe(true)
    expect(mockList).not.toHaveBeenCalled()
  })
})
