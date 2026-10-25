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
type Recorded = {
  table: string
  verb: string
  filters: Filter[]
  payload?: unknown
}

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
      update: (payload: unknown) => {
        rec.verb = "update"
        rec.payload = payload
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

    expect(result).toMatchObject({
      ok: false,
      error: "Couldn't read this connection's balance.",
    })
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("hunter conn-1"),
      boom
    )
    logSpy.mockRestore()
  })

  // QUO-289: the poll needs the facts to decide a "stopped checking" alert.
  it("reports a failed read's streak and whether the key was rejected", async () => {
    const { encrypt } = await import("@/lib/crypto")
    readBalance.mockResolvedValueOnce({
      ok: false,
      error: "Hunter rejected this key.",
    } as never)
    const db = recordingSupabase({
      "connections.select": () => ({
        id: "conn-1",
        user_id: "user-1",
        tool_id: "hunter",
        encrypted_key: encrypt("secret-key"),
        name: "Hunter main",
        alert_enabled: true,
        consecutive_failures: 2,
        failure_alerted_at: "2026-10-18T09:00:00.000Z",
        tool: { name: "Hunter" },
      }),
    })

    const result = await refreshConnectionWith(db.client, "conn-1")

    expect(result).toEqual({
      ok: false,
      error: "Hunter rejected this key.",
      stopped: {
        connectionId: "conn-1",
        userId: "user-1",
        toolName: "Hunter",
        connectionName: "Hunter main",
        alertEnabled: true,
        consecutiveFailures: 3,
        keyRejected: true,
        failureAlertedAt: "2026-10-18T09:00:00.000Z",
      },
    })
    expect(db.recorded.find((r) => r.verb === "update")?.payload).toMatchObject(
      { status: "error", consecutive_failures: 3 }
    )
  })

  it("never writes the alert stamp itself, on either path", async () => {
    // Manual refresh runs this as the signed-in user, and 065's column grant
    // leaves the stamp out on purpose: writing it here would fail the whole
    // update and break refresh for everyone.
    const { encrypt } = await import("@/lib/crypto")
    const row = () => ({
      id: "conn-1",
      user_id: "user-1",
      tool_id: "hunter",
      encrypted_key: encrypt("secret-key"),
      name: "Hunter main",
      alert_enabled: true,
      consecutive_failures: 4,
      failure_alerted_at: "2026-10-18T09:00:00.000Z",
    })
    const ok = recordingSupabase({ "connections.select": row })
    const okResult = await refreshConnectionWith(ok.client, "conn-1")
    readBalance.mockResolvedValueOnce({ ok: false, error: "down" } as never)
    const failed = recordingSupabase({ "connections.select": row })
    await refreshConnectionWith(failed.client, "conn-1")

    for (const r of [...ok.recorded, ...failed.recorded]) {
      if (r.verb === "update") {
        expect(r.payload).not.toHaveProperty("failure_alerted_at")
      }
    }
    // Dispatch reads it from the evaluation to clean up after an incident.
    expect(okResult.ok && okResult.alert?.failureAlertedAt).toBe(
      "2026-10-18T09:00:00.000Z"
    )
  })
})
