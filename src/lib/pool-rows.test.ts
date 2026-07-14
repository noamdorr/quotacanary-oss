import { describe, expect, it } from "vitest"
import { STALE_AFTER_MS } from "./balance-status"
import { newestRecordedAt, toPoolRows } from "./pool-rows"
import type { ConnectionStatus, ConnectionWithBalance, PoolView } from "./types"

const pool = (
  creditType: string,
  recordedAt = "2026-05-27T00:00:00Z"
): PoolView => ({
  creditType,
  label: creditType,
  unit: "credits",
  balance: 1,
  balanceLimit: null,
  recorded_at: recordedAt,
  history: [],
})

function conn(
  id: string,
  pools: PoolView[],
  status: ConnectionStatus = "active"
): ConnectionWithBalance {
  return { id, status, pools } as unknown as ConnectionWithBalance
}

describe("toPoolRows", () => {
  it("emits one row per pool", () => {
    const rows = toPoolRows([
      conn("a", [pool("searches"), pool("verifications")]),
    ])
    expect(rows.map((r) => [r.connection.id, r.pool?.creditType])).toEqual([
      ["a", "searches"],
      ["a", "verifications"],
    ])
  })

  it("emits a placeholder row for a connection with no pools", () => {
    const rows = toPoolRows([conn("b", [])])
    expect(rows).toHaveLength(1)
    expect(rows[0].pool).toBeNull()
  })

  it("ages an active connection to stale when its newest reading is old", () => {
    const old = new Date(Date.now() - (STALE_AFTER_MS + 60_000)).toISOString()
    const rows = toPoolRows([conn("c", [pool("searches", old)])])
    expect(rows[0].connection.status).toBe("stale")
  })

  it("keeps an active connection active when its reading is fresh", () => {
    const fresh = new Date(Date.now() - 60_000).toISOString()
    const rows = toPoolRows([conn("d", [pool("searches", fresh)])])
    expect(rows[0].connection.status).toBe("active")
  })

  it("leaves a no-reading connection untouched (no data, not stale)", () => {
    const rows = toPoolRows([conn("e", [])])
    expect(rows[0].connection.status).toBe("active")
  })
})

describe("newestRecordedAt", () => {
  it("returns the newest timestamp across pools", () => {
    const c = conn("f", [
      pool("searches", "2026-05-01T00:00:00Z"),
      pool("verifications", "2026-05-03T00:00:00Z"),
      pool("exports", "2026-05-02T00:00:00Z"),
    ])
    expect(newestRecordedAt(c)).toBe("2026-05-03T00:00:00Z")
  })

  it("returns null when there are no pools", () => {
    expect(newestRecordedAt(conn("g", []))).toBeNull()
  })
})
