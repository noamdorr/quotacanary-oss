import { describe, expect, it } from "vitest"
import { burnRate } from "./burn-rate"

// helper: history is most-recent-first (as returned by the DB layer)
const day = (n: number) => new Date(2026, 0, n).toISOString()

describe("burnRate", () => {
  it("computes per-day consumption and days left on a downward trend", () => {
    // newest 8000 on day 11, oldest 10000 on day 1 → 2000 over 10 days = 200/day
    const r = burnRate([
      { balance: 8000, recorded_at: day(11) },
      { balance: 9000, recorded_at: day(6) },
      { balance: 10000, recorded_at: day(1) },
    ])
    expect(r).not.toBeNull()
    expect(r?.perDay).toBeCloseTo(200, 5)
    expect(r?.daysLeft).toBe(40)
  })

  it("keeps fractional days left for sub-day runway", () => {
    const r = burnRate([
      { balance: 104, recorded_at: day(3) },
      { balance: 1000, recorded_at: day(1) },
    ])
    expect(r).not.toBeNull()
    expect(r?.perDay).toBeCloseTo(448, 5)
    expect(r?.daysLeft).toBeCloseTo(104 / 448, 5)
  })

  it("returns null for a flat trend", () => {
    expect(
      burnRate([
        { balance: 5000, recorded_at: day(10) },
        { balance: 5000, recorded_at: day(1) },
      ])
    ).toBeNull()
  })

  it("returns null for an increasing trend", () => {
    expect(
      burnRate([
        { balance: 7000, recorded_at: day(10) },
        { balance: 5000, recorded_at: day(1) },
      ])
    ).toBeNull()
  })

  it("returns null with fewer than two readings", () => {
    expect(burnRate([{ balance: 5000, recorded_at: day(1) }])).toBeNull()
    expect(burnRate([])).toBeNull()
  })

  it("returns null when readings share the same timestamp", () => {
    expect(
      burnRate([
        { balance: 4000, recorded_at: day(1) },
        { balance: 5000, recorded_at: day(1) },
      ])
    ).toBeNull()
  })
})
