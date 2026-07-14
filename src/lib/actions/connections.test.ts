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

function fakeSupabase(
  toolRow: Record<string, unknown> = { credential_fields: null }
): {
  client: SupabaseClient
  inserts: Record<string, InsertPayload[]>
} {
  const inserts: Record<string, InsertPayload[]> = {}

  function builderFor(table: string) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(async () => {
        if (table === "tools") return { data: toolRow }
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

type Filter = [string, unknown]
type Recorded = { table: string; verb: string; filters: Filter[] }

// Minimal thenable query builder that records the verb + filter chain per
// from() call, so tests can assert every mutation is scoped to the user.
function recordingSupabase(singles: Record<string, () => unknown> = {}): {
  client: SupabaseClient
  recorded: Recorded[]
} {
  const recorded: Recorded[] = []
  function from(table: string) {
    const rec: Recorded = { table, verb: "", filters: [] }
    recorded.push(rec)
    const builder = {
      select: () => {
        if (!rec.verb) rec.verb = "select"
        return builder
      },
      update: () => {
        rec.verb = "update"
        return builder
      },
      delete: () => {
        rec.verb = "delete"
        return builder
      },
      insert: () => {
        rec.verb = "insert"
        return builder
      },
      eq: (col: string, val: unknown) => {
        rec.filters.push([col, val])
        return builder
      },
      single: async () => {
        const make = singles[`${rec.table}.${rec.verb}`]
        return { data: make ? make() : null, error: null }
      },
      // biome-ignore lint/suspicious/noThenProperty: mimics Supabase's thenable query builder
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null }),
    }
    return builder
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from,
  } as unknown as SupabaseClient
  return { client, recorded }
}

function filtersOf(recorded: Recorded[], table: string, verb: string) {
  return recorded.find((r) => r.table === table && r.verb === verb)?.filters
}

const OWNER_FILTER: Filter = ["user_id", "user-1"]

async function importWith(db: { client: SupabaseClient }) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => db.client,
  }))
  return import("./connections")
}

describe("mutation ownership filters (defense in depth)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("scopes renameConnection's update to the signed-in user", async () => {
    const db = recordingSupabase()
    const { renameConnection } = await importWith(db)

    await renameConnection("conn-1", "New name")

    expect(filtersOf(db.recorded, "connections", "update")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
  })

  it("scopes removeConnection's delete to the signed-in user", async () => {
    const db = recordingSupabase()
    const { removeConnection } = await importWith(db)

    await removeConnection("conn-1")

    expect(filtersOf(db.recorded, "connections", "delete")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
  })

  it("scopes setAlert's update to the signed-in user", async () => {
    const db = recordingSupabase()
    const { setAlert } = await importWith(db)

    await setAlert("conn-1", false)

    expect(filtersOf(db.recorded, "connections", "update")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
  })

  it("scopes setThresholds' update to the signed-in user", async () => {
    const db = recordingSupabase()
    const { setThresholds } = await importWith(db)

    await setThresholds("conn-1", 100, 10)

    expect(filtersOf(db.recorded, "connections", "update")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
  })

  it("scopes setPoolThresholds' read and write to the signed-in user", async () => {
    const db = recordingSupabase({
      "connections.select": () => ({ pool_thresholds: {} }),
    })
    const { setPoolThresholds } = await importWith(db)

    await setPoolThresholds("conn-1", "credits", 100, 10)

    expect(filtersOf(db.recorded, "connections", "select")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
    expect(filtersOf(db.recorded, "connections", "update")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
  })

  it("scopes updateKey's read and write to the signed-in user", async () => {
    const db = recordingSupabase({
      "connections.select": () => ({
        tool_id: "hunter",
        tool: { credential_fields: null },
      }),
    })
    const { updateKey } = await importWith(db)

    const result = await updateKey("conn-1", "new-key")

    expect(result).toEqual({ ok: true })
    expect(filtersOf(db.recorded, "connections", "select")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
    expect(filtersOf(db.recorded, "connections", "update")).toEqual(
      expect.arrayContaining([["id", "conn-1"], OWNER_FILTER])
    )
  })

  it("refuses to refresh a connection the user doesn't own", async () => {
    // No configured reads: the ownership lookup returns null, as it would for
    // a foreign connection id under the user-scoped filter.
    const db = recordingSupabase()
    const { refreshConnection } = await importWith(db)

    const result = await refreshConnection("conn-other")

    expect(result).toEqual({ ok: false, error: "Connection not found." })
    expect(filtersOf(db.recorded, "connections", "select")).toEqual(
      expect.arrayContaining([["id", "conn-other"], OWNER_FILTER])
    )
    expect(filtersOf(db.recorded, "connections", "update")).toBeUndefined()
  })
})

function connectForm(overrides: Record<string, string> = {}) {
  const formData = new FormData()
  formData.set("toolId", "hunter")
  formData.set("name", "Hunter")
  formData.set("apiKey", "hunter-key")
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value)
  }
  return formData
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

  it("rejects a name over 80 characters", async () => {
    const db = fakeSupabase()
    const { connectTool } = await importWith(db)

    const result = await connectTool(connectForm({ name: "a".repeat(81) }))

    expect(result).toEqual({
      ok: false,
      error: "That name is too long (80 characters max).",
    })
    expect(db.inserts.connections).toBeUndefined()
  })

  it("accepts an 80-character name", async () => {
    const db = fakeSupabase()
    const { connectTool } = await importWith(db)

    const result = await connectTool(connectForm({ name: "a".repeat(80) }))

    expect(result).toMatchObject({ ok: true })
    expect(db.inserts.connections[0]).toMatchObject({ name: "a".repeat(80) })
  })

  it("rejects more than 20 tags", async () => {
    const db = fakeSupabase()
    const { connectTool } = await importWith(db)
    const tags = Array.from({ length: 21 }, (_, i) => `tag-${i}`).join(",")

    const result = await connectTool(connectForm({ tags }))

    expect(result).toEqual({ ok: false, error: "Too many tags (20 max)." })
  })

  it("rejects a tag over 40 characters", async () => {
    const db = fakeSupabase()
    const { connectTool } = await importWith(db)

    const result = await connectTool(connectForm({ tags: "a".repeat(41) }))

    expect(result).toEqual({
      ok: false,
      error: "Tags must be 40 characters or fewer.",
    })
  })

  it("passes watched values matching the tool's pools through to the insert", async () => {
    const db = fakeSupabase({
      credential_fields: null,
      pools: [
        { credit_type: "credits", label: "Credits", unit: "credits" },
        { credit_type: "emails", label: "Emails", unit: "emails" },
      ],
    })
    const { connectTool } = await importWith(db)
    const formData = connectForm()
    formData.append("watchedCreditTypes", "credits")

    const result = await connectTool(formData)

    expect(result).toMatchObject({ ok: true })
    expect(db.inserts.connections[0]).toMatchObject({
      watched_credit_types: ["credits"],
    })
  })

  it("rejects a watched value the tool doesn't declare", async () => {
    const db = fakeSupabase({
      credential_fields: null,
      pools: [{ credit_type: "credits", label: "Credits", unit: "credits" }],
    })
    const { connectTool } = await importWith(db)
    const formData = connectForm()
    formData.append("watchedCreditTypes", "emails")

    const result = await connectTool(formData)

    expect(result).toEqual({
      ok: false,
      error: "Unknown credit pool for this tool.",
    })
    expect(db.inserts.connections).toBeUndefined()
  })

  it("rejects watched values when the tool declares no pools", async () => {
    const db = fakeSupabase({ credential_fields: null, pools: null })
    const { connectTool } = await importWith(db)
    const formData = connectForm()
    formData.append("watchedCreditTypes", "credits")

    const result = await connectTool(formData)

    expect(result).toEqual({
      ok: false,
      error: "Unknown credit pool for this tool.",
    })
  })
})

describe("requestTool", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("rejects a tool name over 120 characters", async () => {
    const db = fakeSupabase()
    const { requestTool } = await importWith(db)
    const formData = new FormData()
    formData.set("toolName", "a".repeat(121))

    const result = await requestTool(formData)

    expect(result).toEqual({
      ok: false,
      error: "Tool name is too long (120 characters max).",
    })
  })

  it("rejects a note over 1,000 characters", async () => {
    const db = fakeSupabase()
    const { requestTool } = await importWith(db)
    const formData = new FormData()
    formData.set("toolName", "Some tool")
    formData.set("note", "a".repeat(1001))

    const result = await requestTool(formData)

    expect(result).toEqual({
      ok: false,
      error: "Note is too long (1,000 characters max).",
    })
  })
})

describe("renameConnection validation", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("rejects a name over 80 characters", async () => {
    const db = recordingSupabase()
    const { renameConnection } = await importWith(db)

    const result = await renameConnection("conn-1", "a".repeat(81))

    expect(result).toEqual({
      ok: false,
      error: "That name is too long (80 characters max).",
    })
    expect(filtersOf(db.recorded, "connections", "update")).toBeUndefined()
  })
})

describe("tools page revalidation", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("renameConnection revalidates the tools page", async () => {
    const db = recordingSupabase()
    const { renameConnection } = await importWith(db)

    await renameConnection("conn-1", "New name")

    expect(revalidatePath).toHaveBeenCalledWith("/tools/[toolId]", "page")
  })

  it("removeConnection revalidates the tools page", async () => {
    const db = recordingSupabase()
    const { removeConnection } = await importWith(db)

    await removeConnection("conn-1")

    expect(revalidatePath).toHaveBeenCalledWith("/tools/[toolId]", "page")
  })

  it("updateKey revalidates the tools page", async () => {
    const db = recordingSupabase({
      "connections.select": () => ({
        tool_id: "hunter",
        tool: { credential_fields: null },
      }),
    })
    const { updateKey } = await importWith(db)

    const result = await updateKey("conn-1", "new-key")

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith("/tools/[toolId]", "page")
  })

  it("refreshConnection revalidates the tools page", async () => {
    const { encrypt } = await import("@/lib/crypto")
    const db = recordingSupabase({
      "connections.select": () => ({
        id: "conn-1",
        user_id: "user-1",
        tool_id: "hunter",
        encrypted_key: encrypt("secret-key"),
        name: "Conn",
        alert_enabled: true,
      }),
    })
    const { refreshConnection } = await importWith(db)

    const result = await refreshConnection("conn-1")

    expect(result).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith("/tools/[toolId]", "page")
  })
})
