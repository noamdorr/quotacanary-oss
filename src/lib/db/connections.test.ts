import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import { listConnectionsWithBalance } from "./connections"

const USER_ID = "user-1"

function historyRow(
  connectionId: string,
  creditType: string,
  balance: number,
  recordedAt: string
) {
  return {
    connection_id: connectionId,
    credit_type: creditType,
    label: creditType,
    unit: "credits",
    balance,
    balance_limit: null,
    recorded_at: recordedAt,
  }
}

// biome-ignore lint/suspicious/noExplicitAny: test double for the supabase client
function mockSupabase(connections: any[], history: any[]): SupabaseClient {
  const order = vi.fn(() => Promise.resolve({ data: connections, error: null }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn(() => Promise.resolve({ data: history, error: null }))
  return { from, select, eq, order, rpc } as unknown as SupabaseClient
}

describe("listConnectionsWithBalance", () => {
  it("fetches sampled history via the pool_history_sampled RPC", async () => {
    const supabase = mockSupabase([], [])
    await listConnectionsWithBalance(supabase, USER_ID)
    expect(supabase.rpc).toHaveBeenCalledWith("pool_history_sampled", {
      p_user_id: USER_ID,
    })
  })

  it("groups history rows by connection into pools", async () => {
    const connections = [
      { id: "conn-a", watched_credit_types: null },
      { id: "conn-b", watched_credit_types: null },
    ]
    // Newest-first per connection, pools interleaved (RPC output order).
    const history = [
      historyRow("conn-a", "credits", 1.14, "2026-07-16T07:00:00Z"),
      historyRow("conn-a", "credits", 3.68, "2026-07-09T07:00:00Z"),
      historyRow("conn-b", "searches", 100, "2026-07-16T07:00:00Z"),
      historyRow("conn-b", "exports", 5, "2026-07-16T07:00:00Z"),
    ]
    const result = await listConnectionsWithBalance(
      mockSupabase(connections, history),
      USER_ID
    )

    expect(result).toHaveLength(2)
    expect(result[0].pools).toHaveLength(1)
    expect(result[0].pools[0].balance).toBe(1.14)
    expect(result[0].pools[0].history).toEqual([
      { balance: 1.14, recorded_at: "2026-07-16T07:00:00Z" },
      { balance: 3.68, recorded_at: "2026-07-09T07:00:00Z" },
    ])
    expect(result[1].pools.map((p) => p.creditType)).toEqual([
      "searches",
      "exports",
    ])
  })

  it("returns empty pools for a connection with no readings", async () => {
    const connections = [{ id: "conn-a", watched_credit_types: null }]
    const result = await listConnectionsWithBalance(
      mockSupabase(connections, []),
      USER_ID
    )
    expect(result[0].pools).toEqual([])
  })

  it("filters pools to watched_credit_types", async () => {
    const connections = [{ id: "conn-a", watched_credit_types: ["searches"] }]
    const history = [
      historyRow("conn-a", "searches", 100, "2026-07-16T07:00:00Z"),
      historyRow("conn-a", "exports", 5, "2026-07-16T07:00:00Z"),
    ]
    const result = await listConnectionsWithBalance(
      mockSupabase(connections, history),
      USER_ID
    )
    expect(result[0].pools.map((p) => p.creditType)).toEqual(["searches"])
  })
})
