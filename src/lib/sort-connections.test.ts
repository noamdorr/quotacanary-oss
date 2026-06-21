import { describe, expect, it } from "vitest"
import type { PoolRow } from "./pool-rows"
import { sortPoolRows } from "./sort-connections"
import type { ConnectionWithBalance, PoolView } from "./types"

const tool = {
  id: "t",
  name: "T",
  logo_url: null,
  topup_url: null,
  default_low_threshold: null,
  default_alert_threshold: null,
  pools: null,
}

function row(id: string, balance: number, status = "active"): PoolRow {
  const pool: PoolView = {
    creditType: "credits",
    label: "Credits",
    unit: "credits",
    balance,
    balanceLimit: null,
    recorded_at: "2026-05-27T00:00:00Z",
    history: [],
  }
  return {
    pool,
    connection: {
      id,
      name: id,
      status,
      alert_threshold: 100,
      low_threshold: 300,
      pool_thresholds: null,
      watched_credit_types: null,
      tool,
      pools: [pool],
    } as unknown as ConnectionWithBalance,
  }
}

describe("sortPoolRows", () => {
  it("sorts by balance ascending", () => {
    const sorted = sortPoolRows([row("a", 50), row("b", 10)], "balance", "asc")
    expect(sorted.map((r) => r.connection.id)).toEqual(["b", "a"])
  })

  it("sorts most urgent first by status", () => {
    const sorted = sortPoolRows(
      [row("ok", 9999), row("crit", 1)],
      "status",
      "asc"
    )
    expect(sorted[0].connection.id).toBe("crit")
  })

  it("sorts by name", () => {
    const sorted = sortPoolRows(
      [row("zeta", 1), row("alpha", 1)],
      "name",
      "asc"
    )
    expect(sorted.map((r) => r.connection.id)).toEqual(["alpha", "zeta"])
  })

  it("sorts a no-data row (null pool) as least urgent", () => {
    const noData: PoolRow = {
      pool: null,
      connection: {
        id: "nodata",
        name: "nodata",
        status: "active",
        alert_threshold: 100,
        low_threshold: 300,
        pool_thresholds: null,
        watched_credit_types: null,
        tool,
        pools: [],
      } as unknown as ConnectionWithBalance,
    }
    const sorted = sortPoolRows(
      [noData, row("healthy", 9999), row("crit", 1)],
      "status",
      "asc"
    )
    expect(sorted.map((r) => r.connection.id)).toEqual([
      "crit",
      "healthy",
      "nodata",
    ])
  })
})
