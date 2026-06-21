import { formatBurnEta } from "@/lib/burn-eta"
import { describe, expect, it } from "vitest"

// Fixed reference point: Wednesday, 2026-05-27 12:00 UTC.
const NOW = new Date("2026-05-27T12:00:00Z")

describe("formatBurnEta", () => {
  it("returns a dead-on-arrival verdict for zero balance runway", () => {
    expect(formatBurnEta(0, NOW)).toEqual({
      short: "already gone",
      long: "Already empty.",
    })
  })

  it("uses hours when under a day", () => {
    expect(formatBurnEta(0.25, NOW)).toEqual({
      short: "~6h",
      long: "Empties in ~6 hours.",
    })
  })

  it("names the weekday when under a week out", () => {
    // 2 days from Wed → Fri
    expect(formatBurnEta(2, NOW)).toEqual({
      short: "burns out Friday",
      long: "Empties in ~2 days.",
    })
  })

  it("uses tomorrow for roughly one day out", () => {
    expect(formatBurnEta(1, NOW)).toEqual({
      short: "burns out tomorrow",
      long: "Empties tomorrow.",
    })
  })

  it("uses weeks when under 28 days", () => {
    expect(formatBurnEta(16, NOW)).toEqual({
      short: "~2 weeks",
      long: "Empties in ~16 days.",
    })
  })

  it("uses months when under a year", () => {
    expect(formatBurnEta(90, NOW)).toEqual({
      short: "~3 months",
      long: "Empties in ~3 months.",
    })
  })

  it("treats null (no measurable burn) as plenty", () => {
    expect(formatBurnEta(null, NOW)).toEqual({
      short: "no burn yet",
      long: "Not draining yet.",
    })
  })

  it("uses singular 'hour' at exactly one hour", () => {
    expect(formatBurnEta(1 / 24, NOW)).toEqual({
      short: "~1h",
      long: "Empties in ~1 hour.",
    })
  })
})
