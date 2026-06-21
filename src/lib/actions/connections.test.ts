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
const revalidatePath = vi.fn()

vi.mock("@/lib/adapters/registry", () => ({
  getAdapter: () => ({ readBalance }),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))

type InsertPayload = Record<string, unknown>

function fakeSupabase(): {
  client: SupabaseClient
  inserts: Record<string, InsertPayload[]>
} {
  const inserts: Record<string, InsertPayload[]> = {}

  function builderFor(table: string) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(async () => {
        if (table === "tools") return { data: { credential_fields: null } }
        if (table === "connections") return { data: { id: "conn-1" } }
        return { data: null }
      }),
      insert: vi.fn((payload: InsertPayload | InsertPayload[]) => {
        inserts[table] = [
          ...(inserts[table] ?? []),
          ...(Array.isArray(payload) ? payload : [payload]),
        ]
        if (table === "balances") return { error: null }
        return builder
      }),
    }
    return builder
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    from: vi.fn((table: string) => builderFor(table)),
  } as unknown as SupabaseClient

  return { client, inserts }
}

describe("connectTool", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("enables alerts by default for new API connections", async () => {
    const db = fakeSupabase()
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => db.client,
    }))
    const { connectTool } = await import("./connections")
    const formData = new FormData()
    formData.set("toolId", "hunter")
    formData.set("name", "Hunter")
    formData.set("apiKey", "hunter-key")

    const result = await connectTool(formData)

    expect(result).toMatchObject({ ok: true, connectionId: "conn-1" })
    expect(db.inserts.connections[0]).toMatchObject({
      user_id: "user-1",
      tool_id: "hunter",
      alert_enabled: true,
    })
  })
})
