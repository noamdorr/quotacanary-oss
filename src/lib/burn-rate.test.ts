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

  it("reflects burn after a mid-window top-up instead of masking it (QUO-59)", () => {
    // Mirrors the QUO-59 worked example: decline, refill, decline again.
    // The old oldest-vs-newest calc saw 1000 -> 900 and reported a ~63-day
    // runway; the real burn after the refill empties the pool in about a week.
    const r = burnRate([
      { balance: 1000, recorded_at: day(1) },
      { balance: 100, recorded_at: day(6) },
      { balance: 1200, recorded_at: day(7) },
      { balance: 900, recorded_at: day(9) },
    ])
    expect(r).not.toBeNull()
    expect(r?.perDay).toBeCloseTo(150, 5)
    expect(r?.daysLeft).toBeCloseTo(6, 5)
  })

  it("sums consumption across multiple refills in the same window", () => {
    const r = burnRate([
      { balance: 1000, recorded_at: day(1) },
      { balance: 800, recorded_at: day(2) },
      { balance: 1600, recorded_at: day(3) },
      { balance: 1400, recorded_at: day(4) },
      { balance: 2200, recorded_at: day(5) },
      { balance: 2000, recorded_at: day(6) },
    ])
    expect(r).not.toBeNull()
    expect(r?.perDay).toBeCloseTo(120, 5)
    expect(r?.daysLeft).toBeCloseTo(2000 / 120, 5)
  })

  it("still projects a runway when the most recent reading is itself a refill", () => {
    const r = burnRate([
      { balance: 1000, recorded_at: day(1) },
      { balance: 600, recorded_at: day(2) },
      { balance: 1200, recorded_at: day(3) },
    ])
    expect(r).not.toBeNull()
    expect(r?.perDay).toBeCloseTo(200, 5)
    expect(r?.daysLeft).toBeCloseTo(6, 5)
  })
})
