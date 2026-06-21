import { describe, expect, it } from "vitest"
import { evaluateSeverity, nextAlertAction } from "./severity"

describe("evaluateSeverity", () => {
  it("returns healthy when all pools are above thresholds", () => {
    expect(evaluateSeverity([{ balance: 100, low: 50, critical: 20 }])).toBe(
      "healthy"
    )
  })
  it("returns low when below low but above critical", () => {
    expect(evaluateSeverity([{ balance: 40, low: 50, critical: 20 }])).toBe(
      "low"
    )
  })
  it("returns critical when below the critical threshold", () => {
    expect(evaluateSeverity([{ balance: 10, low: 50, critical: 20 }])).toBe(
      "critical"
    )
  })
  it("critical on any pool wins over a low pool", () => {
    expect(
      evaluateSeverity([
        { balance: 40, low: 50, critical: 20 },
        { balance: 5, low: 50, critical: 20 },
      ])
    ).toBe("critical")
  })
  it("ignores pools with null thresholds", () => {
    expect(evaluateSeverity([{ balance: 0, low: null, critical: null }])).toBe(
      "healthy"
    )
  })
  it("treats a balance exactly at the critical threshold as critical", () => {
    // Sitting on the boundary must agree with the dashboard pill, which uses
    // inclusive `<=` in balance-status.ts.
    expect(evaluateSeverity([{ balance: 20, low: 50, critical: 20 }])).toBe(
      "critical"
    )
  })
  it("treats a balance exactly at the low threshold as low", () => {
    expect(evaluateSeverity([{ balance: 50, low: 50, critical: 20 }])).toBe(
      "low"
    )
  })
})

describe("nextAlertAction", () => {
  const base = { notifyMode: "low_and_critical" as const, alertEnabled: true }
  it("sends low on first crossing into low", () => {
    expect(
      nextAlertAction({ ...base, severity: "low", notifiedLevel: "none" })
    ).toEqual({ send: "low", newLevel: "low" })
  })
  it("does not resend low when already at low", () => {
    expect(
      nextAlertAction({ ...base, severity: "low", notifiedLevel: "low" })
    ).toEqual({ send: null, newLevel: "low" })
  })
  it("escalates low -> critical", () => {
    expect(
      nextAlertAction({ ...base, severity: "critical", notifiedLevel: "low" })
    ).toEqual({ send: "critical", newLevel: "critical" })
  })
  it("sends critical on a none -> critical jump", () => {
    expect(
      nextAlertAction({ ...base, severity: "critical", notifiedLevel: "none" })
    ).toEqual({ send: "critical", newLevel: "critical" })
  })
  it("re-arms on recovery to healthy", () => {
    expect(
      nextAlertAction({
        ...base,
        severity: "healthy",
        notifiedLevel: "critical",
      })
    ).toEqual({ send: null, newLevel: "none" })
  })
  it("holds the high-water mark when critical bobs to low", () => {
    expect(
      nextAlertAction({ ...base, severity: "low", notifiedLevel: "critical" })
    ).toEqual({ send: null, newLevel: "critical" })
  })
  it("critical-only mode ignores the low stage", () => {
    expect(
      nextAlertAction({
        notifyMode: "critical",
        alertEnabled: true,
        severity: "low",
        notifiedLevel: "none",
      })
    ).toEqual({ send: null, newLevel: "none" })
  })
  it("critical-only mode sends at critical", () => {
    expect(
      nextAlertAction({
        notifyMode: "critical",
        alertEnabled: true,
        severity: "critical",
        notifiedLevel: "none",
      })
    ).toEqual({ send: "critical", newLevel: "critical" })
  })
  it("off mode never sends", () => {
    expect(
      nextAlertAction({
        notifyMode: "off",
        alertEnabled: true,
        severity: "critical",
        notifiedLevel: "none",
      })
    ).toEqual({ send: null, newLevel: "none" })
  })
  it("disabled connection never sends", () => {
    expect(
      nextAlertAction({
        notifyMode: "low_and_critical",
        alertEnabled: false,
        severity: "critical",
        notifiedLevel: "none",
      })
    ).toEqual({ send: null, newLevel: "none" })
  })
})
