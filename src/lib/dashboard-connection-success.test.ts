import { describe, expect, it } from "vitest"
import {
  connectionRowsForSuccess,
  formatSuccessPoolBalance,
} from "./dashboard-connection-success"
import type { ConnectionWithBalance, PoolView } from "./types"

const pool = (
  creditType: string,
  balance: number,
  balanceLimit: number | null,
  unit = "credits"
): PoolView => ({
  creditType,
  label: creditType,
  unit,
  balance,
  balanceLimit,
  recorded_at: "2026-06-12T10:00:00Z",
  history: [],
})

function conn(id: string, pools: PoolView[]): ConnectionWithBalance {
  return { id, status: "active", pools } as unknown as ConnectionWithBalance
}

describe("dashboard connection success helpers", () => {
  it("returns only rows for the newly connected connection", () => {
    const rows = connectionRowsForSuccess(
      [
        conn("old", [pool("emails", 100, null)]),
        conn("new", [pool("credits", 3200, 5000), pool("topups", 25, null)]),
      ],
      "new"
    )

    expect(rows.map((r) => r.pool?.creditType)).toEqual(["credits", "topups"])
  })

  it("does not show a confirmation when the connection id is missing", () => {
    const rows = connectionRowsForSuccess(
      [conn("old", [pool("emails", 100, null)])],
      null
    )

    expect(rows).toEqual([])
  })

  it("formats the current balance with the pool limit when one exists", () => {
    expect(formatSuccessPoolBalance(pool("credits", 3200, 5000))).toBe(
      "3,200 / 5,000"
    )
  })
})
