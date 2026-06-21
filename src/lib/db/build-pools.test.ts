import { describe, expect, it } from "vitest"
import { type BalanceRow, buildPools } from "./build-pools"

// Rows arrive newest-first (query orders recorded_at desc).
const rows: BalanceRow[] = [
  {
    credit_type: "verifications",
    label: "Verifications",
    unit: "credits",
    balance: 520,
    balance_limit: 1000,
    recorded_at: "2026-05-27T10:00:00Z",
  },
  {
    credit_type: "searches",
    label: "Searches",
    unit: "credits",
    balance: 0,
    balance_limit: 0,
    recorded_at: "2026-05-27T10:00:00Z",
  },
  {
    credit_type: "verifications",
    label: "Verifications",
    unit: "credits",
    balance: 600,
    balance_limit: 1000,
    recorded_at: "2026-05-27T09:00:00Z",
  },
]

describe("buildPools", () => {
  it("groups by credit_type, newest first, with per-pool history", () => {
    const pools = buildPools(rows, null, 30)
    expect(pools).toEqual([
      {
        creditType: "verifications",
        label: "Verifications",
        unit: "credits",
        balance: 520,
        balanceLimit: 1000,
        recorded_at: "2026-05-27T10:00:00Z",
        history: [
          { balance: 520, recorded_at: "2026-05-27T10:00:00Z" },
          { balance: 600, recorded_at: "2026-05-27T09:00:00Z" },
        ],
      },
      {
        creditType: "searches",
        label: "Searches",
        unit: "credits",
        balance: 0,
        balanceLimit: 0,
        recorded_at: "2026-05-27T10:00:00Z",
        history: [{ balance: 0, recorded_at: "2026-05-27T10:00:00Z" }],
      },
    ])
  })

  it("filters to watched credit types when provided", () => {
    const pools = buildPools(rows, ["verifications"], 30)
    expect(pools.map((p) => p.creditType)).toEqual(["verifications"])
  })

  it("returns empty when there are no rows", () => {
    expect(buildPools([], null, 30)).toEqual([])
  })

  it("caps history length per pool", () => {
    const many: BalanceRow[] = Array.from({ length: 5 }, (_, i) => ({
      credit_type: "credits",
      label: "Credits",
      unit: "credits",
      balance: 100 - i,
      balance_limit: null,
      recorded_at: `2026-05-2${5 - i}T00:00:00Z`,
    }))
    expect(buildPools(many, null, 2)[0].history).toHaveLength(2)
  })
})
