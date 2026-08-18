import { refreshConnectionWith } from "@/lib/refresh-connection"
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
  getAdapter: () => ({ readBalance }),
}))

type Filter = [string, unknown]
type Recorded = { table: string; verb: string; filters: Filter[] }

// Minimal thenable query builder that records the verb + filter chain per
// from() call. Mirrors src/lib/actions/connections.test.ts's helper.
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
  const client = { from } as unknown as SupabaseClient
  return { client, recorded }
}

describe("refreshConnectionWith", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it("logs the underlying cause when the adapter throws", async () => {
    // The caller-facing error is deliberately generic; the real reason
    // (timeout vs auth vs vendor 5xx) must survive somewhere, and the server
    // log is the only place it can.
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { encrypt } = await import("@/lib/crypto")
    const boom = new Error("connect ETIMEDOUT")
    readBalance.mockRejectedValueOnce(boom)
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

    const result = await refreshConnectionWith(db.client, "conn-1")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't read this connection's balance.",
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("hunter conn-1"),
      boom
    )
    logSpy.mockRestore()
  })
})
