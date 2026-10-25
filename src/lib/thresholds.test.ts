import { describe, expect, it } from "vitest"
import {
  criticalFor,
  parsePoolThresholds,
  thresholdOrderError,
  warnBelowError,
} from "./thresholds"

describe("criticalFor", () => {
  it("is a third of Warn below, rounded down, from 3 up", () => {
    expect(criticalFor(900)).toBe(300)
    expect(criticalFor(1000)).toBe(333)
    expect(criticalFor(15)).toBe(5)
    expect(criticalFor(3)).toBe(1)
    // 266.67 and 1.67: rounding to nearest would give 267 and 2.
    expect(criticalFor(800)).toBe(266)
    expect(criticalFor(5)).toBe(1)
  })
  it("keeps two decimals below 3", () => {
    expect(criticalFor(2)).toBe(0.67)
    expect(criticalFor(1)).toBe(0.33)
    expect(criticalFor(0.01)).toBe(0)
  })
  it("always lands below Warn below", () => {
    for (const n of [0.01, 0.5, 1, 2, 2.99, 3, 4, 100, 12345.6]) {
      expect(criticalFor(n)).toBeLessThan(n)
    }
  })
})

describe("warnBelowError", () => {
  it("allows a number above zero", () => {
    expect(warnBelowError(900)).toBeNull()
    expect(warnBelowError(0.5)).toBeNull()
  })
  it("allows blank (falls back to the tool default)", () => {
    expect(warnBelowError(null)).toBeNull()
  })
  it("rejects zero, negatives and non-numbers with one message", () => {
    const message = warnBelowError(0)
    expect(message).toMatch(/above zero/i)
    expect(warnBelowError(-5)).toBe(message)
    expect(warnBelowError(Number.NaN)).toBe(message)
    expect(warnBelowError(Number.POSITIVE_INFINITY)).toBe(message)
  })
})

describe("thresholdOrderError", () => {
  it("allows a low warning above critical", () => {
    expect(thresholdOrderError(3000, 2000)).toBeNull()
  })
  it("rejects a low warning below critical", () => {
    expect(thresholdOrderError(2000, 3000)).toMatch(/higher than Critical/i)
  })
  it("rejects a low warning equal to critical", () => {
    expect(thresholdOrderError(2000, 2000)).toMatch(/higher than Critical/i)
  })
  it("allows a null on either side (only one threshold set)", () => {
    expect(thresholdOrderError(null, 2000)).toBeNull()
    expect(thresholdOrderError(3000, null)).toBeNull()
    expect(thresholdOrderError(null, null)).toBeNull()
  })
  it("allows zero (a legitimate floor)", () => {
    expect(thresholdOrderError(1, 0)).toBeNull()
  })
  it("rejects NaN on either side (Number('junk') from the drawer inputs)", () => {
    expect(thresholdOrderError(Number.NaN, 2000)).toMatch(/number/i)
    expect(thresholdOrderError(3000, Number.NaN)).toMatch(/number/i)
  })
  it("rejects negatives and non-finite values", () => {
    expect(thresholdOrderError(-5, null)).toMatch(/number/i)
    expect(thresholdOrderError(null, -1)).toMatch(/number/i)
    expect(thresholdOrderError(Number.POSITIVE_INFINITY, 10)).toMatch(/number/i)
  })
})

describe("parsePoolThresholds", () => {
  it("keeps each balance's Warn below and Critical as sent", () => {
    expect(
      parsePoolThresholds({
        credits: { low: 500, critical: 166 },
        searches: { low: 1500, critical: 500 },
      })
    ).toEqual({
      ok: true,
      thresholds: {
        credits: { low: 500, critical: 166 },
        searches: { low: 1500, critical: 500 },
      },
    })
  })
  it("derives Critical from Warn below when it is left out", () => {
    expect(parsePoolThresholds({ credits: { low: 900 } })).toEqual({
      ok: true,
      thresholds: { credits: { low: 900, critical: 300 } },
    })
  })
  it("refuses anything but an object of { low, critical } pairs", () => {
    for (const bad of [
      null,
      [],
      "500",
      { credits: 500 },
      { credits: null },
      { credits: [] },
      { "": { low: 500 } },
    ]) {
      expect(parsePoolThresholds(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })
  it("applies the web's Warn below rule and keeps Critical under it", () => {
    for (const bad of [
      { credits: { low: 0 } },
      { credits: { low: -5 } },
      { credits: { low: null } },
      { credits: { low: "500" } },
      { credits: { low: 500, critical: 500 } },
      { credits: { low: 500, critical: -1 } },
      { credits: { low: 500, critical: "1" } },
    ]) {
      expect(parsePoolThresholds(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })
  it("caps the number of balances", () => {
    const many = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`p${i}`, { low: 10 }])
    )
    expect(parsePoolThresholds(many).ok).toBe(false)
  })
})
