import { formatBurnEta } from "@/lib/burn-eta"
import { describe, expect, it } from "vitest"

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

describe("formatBurnEta", () => {
  it("returns a dead-on-arrival verdict for zero balance runway", () => {
    expect(formatBurnEta(0)).toEqual({
      short: "already gone",
      long: "Already empty.",
    })
  })

  it("uses hours when under a day", () => {
    expect(formatBurnEta(0.25)).toEqual({
      short: "~6h",
      long: "Empties in ~6 hours.",
    })
  })

  it("uses singular 'hour' at exactly one hour", () => {
    expect(formatBurnEta(1 / 24)).toEqual({
      short: "~1h",
      long: "Empties in ~1 hour.",
    })
  })

  it("uses tomorrow from one day up to a day and a half", () => {
    const tomorrow = { short: "burns out tomorrow", long: "Empties tomorrow." }
    expect(formatBurnEta(1)).toEqual(tomorrow)
    expect(formatBurnEta(1.49)).toEqual(tomorrow)
  })

  it("uses relative days, not a weekday, from 1.5 days to under a week", () => {
    // QUO-184: the user should never have to recall today's date and do the
    // math. Same wording as the Mac app (Copy.etaDaysShort).
    expect(formatBurnEta(1.5)).toEqual({
      short: "in ~2 days",
      long: "Empties in ~2 days.",
    })
    expect(formatBurnEta(3)).toEqual({
      short: "in ~3 days",
      long: "Empties in ~3 days.",
    })
    expect(formatBurnEta(5.6)).toEqual({
      short: "in ~6 days",
      long: "Empties in ~6 days.",
    })
    expect(formatBurnEta(6.99)).toEqual({
      short: "in ~7 days",
      long: "Empties in ~7 days.",
    })
  })

  it("switches to weeks at exactly seven days and stays there under 28", () => {
    expect(formatBurnEta(7)).toEqual({
      short: "~1 week",
      long: "Empties in ~7 days.",
    })
    expect(formatBurnEta(16)).toEqual({
      short: "~2 weeks",
      long: "Empties in ~16 days.",
    })
    expect(formatBurnEta(27.9)).toEqual({
      short: "~4 weeks",
      long: "Empties in ~28 days.",
    })
  })

  it("switches to months at 28 days and stays there under a year", () => {
    expect(formatBurnEta(28)).toEqual({
      short: "~1 month",
      long: "Empties in ~1 month.",
    })
    expect(formatBurnEta(90)).toEqual({
      short: "~3 months",
      long: "Empties in ~3 months.",
    })
    expect(formatBurnEta(364.9)).toEqual({
      short: "~12 months",
      long: "Empties in ~12 months.",
    })
  })

  it("calls a year or more 'next year'", () => {
    expect(formatBurnEta(365)).toEqual({
      short: "~next year",
      long: "Plenty of runway.",
    })
  })

  it("treats null (no measurable burn) as plenty", () => {
    expect(formatBurnEta(null)).toEqual({
      short: "no burn yet",
      long: "Not draining yet.",
    })
  })

  it("never names a weekday at any runway from 0 to 400 days", () => {
    const outputs = [formatBurnEta(null)]
    for (let tenths = 0; tenths <= 4000; tenths++) {
      outputs.push(formatBurnEta(tenths / 10))
    }
    for (const { short, long } of outputs) {
      for (const day of WEEKDAYS) {
        expect(short).not.toContain(day)
        expect(long).not.toContain(day)
      }
    }
  })
})
