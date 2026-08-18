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

// The RPC double emulates PostgREST's `max_rows` clamp on top of the requested
// `.range()`, because that cap is what silently truncates a wide user's history.
function mockSupabase(
  // biome-ignore lint/suspicious/noExplicitAny: test double for the supabase client
  connections: any[],
  // biome-ignore lint/suspicious/noExplicitAny: test double for the supabase client
  history: any[],
  options: { maxRows?: number } = {}
): SupabaseClient {
  const maxRows = options.maxRows ?? 1000
  const order = vi.fn(() => Promise.resolve({ data: connections, error: null }))
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const ranges: [number, number][] = []
  const rpc = vi.fn(() => ({
    range: (start: number, end: number) => {
      ranges.push([start, end])
      const window = history.slice(start, end + 1)
      return Promise.resolve({ data: window.slice(0, maxRows), error: null })
    },
  }))
  return {
    from,
    select,
    eq,
    order,
    rpc,
    ranges,
  } as unknown as SupabaseClient & { ranges: [number, number][] }
}

describe("listConnectionsWithBalance", () => {
  it("fetches sampled history via the pool_history_sampled RPC", async () => {
    const supabase = mockSupabase([], [])
    await listConnectionsWithBalance(supabase, USER_ID)
    expect(supabase.rpc).toHaveBeenCalledWith("pool_history_sampled", {
      p_user_id: USER_ID,
    })
  })

  it("pages the history RPC past the PostgREST row cap", async () => {
    // The RPC bounds rows per pool (~29), not per response. A user wide enough
    // to cross max_rows in total used to lose the trailing connections' history
    // entirely, and those pools rendered as "No data" with nothing logged.
    const connections = Array.from({ length: 3 }, (_, i) => ({
      id: `conn-${i}`,
      watched_credit_types: null,
    }))
    const history = connections.map((c) =>
      historyRow(c.id, "credits", 10, "2026-07-16T07:00:00Z")
    )
    const supabase = mockSupabase(connections, history, { maxRows: 2 })

    const result = await listConnectionsWithBalance(supabase, USER_ID)

    // Every connection keeps its history, not just the ones inside the cap.
    expect(result.map((c) => c.pools.length)).toEqual([1, 1, 1])
    // Offset advances by rows actually returned, so a max_rows below the page
    // size cannot end the loop early; only an empty page can.
    const { ranges } = supabase as unknown as { ranges: [number, number][] }
    expect(ranges.map(([start]) => start)).toEqual([0, 2, 3])
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
