import { poolEta } from "@/lib/pool-eta"
import type { PoolView } from "@/lib/types"
import { describe, expect, it } from "vitest"

const NOW = new Date("2026-05-27T12:00:00Z") // Wednesday

function pool(history: { balance: number; daysAgo: number }[]): PoolView {
  return {
    creditType: "credits",
    label: "Credits",
    unit: "credits",
    balance: history[history.length - 1].balance,
    balanceLimit: null,
    recorded_at: NOW.toISOString(),
    history: history.map((h) => ({
      balance: h.balance,
      recorded_at: new Date(
        NOW.getTime() - h.daysAgo * 86_400_000
      ).toISOString(),
    })),
  }
}

describe("poolEta", () => {
  it("returns null for a null pool (no readings)", () => {
    expect(poolEta(null, NOW)).toBeNull()
  })

  it("returns 'no burn yet' when the trend is not downward", () => {
    const p = pool([
      { balance: 500, daysAgo: 2 },
      { balance: 500, daysAgo: 0 },
    ])
    expect(poolEta(p, NOW)).toEqual({
      short: "no burn yet",
      long: "Not draining yet.",
    })
  })

  it("translates a downward trend into a weekday ETA", () => {
    // 1000 -> 600 over 2 days = 200/day; 600 left = 3 days -> Saturday
    const p = pool([
      { balance: 1000, daysAgo: 2 },
      { balance: 600, daysAgo: 0 },
    ])
    expect(poolEta(p, NOW)?.short).toBe("burns out Saturday")
  })

  it("uses hours for a positive balance with less than a day of runway", () => {
    // 1000 -> 104 over 2 days = 448/day; 104 left is not empty, just urgent.
    const p = pool([
      { balance: 1000, daysAgo: 2 },
      { balance: 104, daysAgo: 0 },
    ])
    expect(poolEta(p, NOW)).toEqual({
      short: "~6h",
      long: "Empties in ~6 hours.",
    })
  })

  it("reports 'already gone' for a depleted pool even with one reading", () => {
    // balance <= 0 with too few readings to measure burn: must not say "no
    // burn yet" - it is already empty.
    const p = pool([{ balance: 0, daysAgo: 0 }])
    expect(poolEta(p, NOW)).toEqual({
      short: "already gone",
      long: "Already empty.",
    })
  })
})
