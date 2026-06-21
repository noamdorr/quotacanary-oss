import { mostAtRisk } from "@/lib/most-at-risk"
import type { PoolRow } from "@/lib/pool-rows"
import type { ConnectionWithBalance, PoolView } from "@/lib/types"
import { describe, expect, it } from "vitest"

// Fixed base timestamp so burnRate() is deterministic.
const NOW = new Date("2026-05-28T12:00:00Z").getTime()
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function makeRow(id: string, pool: PoolView | null): PoolRow {
  return {
    connection: { id } as ConnectionWithBalance,
    pool,
  }
}

function makePool(
  balance: number,
  history: { balance: number; recorded_at: string }[]
): PoolView {
  return {
    creditType: "credits",
    label: "Credits",
    unit: "credits",
    balance,
    balanceLimit: null,
    recorded_at: daysAgo(0),
    history,
  }
}

describe("mostAtRisk()", () => {
  it("case 1: returns null for empty input", () => {
    expect(mostAtRisk([])).toBeNull()
  })

  it("case 2: returns the row with fewer daysLeft (steeper burn wins)", () => {
    // Row "fast": 900 consumed over 9 days -> 100/day, 100 left -> 1 day
    const fast = makeRow(
      "fast",
      makePool(100, [
        { balance: 1000, recorded_at: daysAgo(9) },
        { balance: 100, recorded_at: daysAgo(0) },
      ])
    )
    // Row "slow": 100 consumed over 10 days -> 10/day, 900 left -> 90 days
    const slow = makeRow(
      "slow",
      makePool(900, [
        { balance: 1000, recorded_at: daysAgo(10) },
        { balance: 900, recorded_at: daysAgo(0) },
      ])
    )
    const result = mostAtRisk([slow, fast])
    expect(result?.connection.id).toBe("fast")
  })

  it("case 3: a row with null pool or flat/rising history is deprioritized over a real countdown", () => {
    // Row "nullpool": no pool data at all
    const nullPool = makeRow("nullpool", null)
    // Row "flat": pool with non-downward (flat) history -> burnRate returns null
    const flat = makeRow(
      "flat",
      makePool(500, [
        { balance: 500, recorded_at: daysAgo(5) },
        { balance: 500, recorded_at: daysAgo(0) },
      ])
    )
    // Row "countdown": genuine downward burn -> should win
    const countdown = makeRow(
      "countdown",
      makePool(50, [
        { balance: 200, recorded_at: daysAgo(5) },
        { balance: 50, recorded_at: daysAgo(0) },
      ])
    )
    const result = mostAtRisk([nullPool, flat, countdown])
    expect(result?.connection.id).toBe("countdown")
  })

  it("case 4: a dry pool (balance <= 0) outranks even a small positive countdown", () => {
    // Row "countdown": 5 days left
    const countdown = makeRow(
      "countdown",
      makePool(50, [
        { balance: 100, recorded_at: daysAgo(5) },
        { balance: 50, recorded_at: daysAgo(0) },
      ])
    )
    // Row "dry": balance is 0, should rank as most urgent
    const dry = makeRow(
      "dry",
      makePool(0, [
        { balance: 200, recorded_at: daysAgo(5) },
        { balance: 0, recorded_at: daysAgo(0) },
      ])
    )
    const result = mostAtRisk([countdown, dry])
    expect(result?.connection.id).toBe("dry")
  })
})
