import { describe, expect, it } from "vitest"
import { heartbeatSuffix, shouldEmailOperator } from "./poll-alarm"

const base = {
  outcome: "ok" as const,
  previousOutcome: "ok" as const,
  missedRuns: 0,
}

describe("heartbeatSuffix", () => {
  it("pings failure only for a failed run", () => {
    expect(heartbeatSuffix("failed")).toBe("/fail")
  })

  it("pings success for a degraded run, so one flaky vendor cannot page", () => {
    expect(heartbeatSuffix("degraded")).toBe("")
    expect(heartbeatSuffix("ok")).toBe("")
  })
})

describe("shouldEmailOperator", () => {
  it("emails on a failed run", () => {
    expect(shouldEmailOperator({ ...base, outcome: "failed" })).toBe(true)
  })

  it("stays quiet on a healthy run", () => {
    expect(shouldEmailOperator(base)).toBe(false)
  })

  it("stays quiet on a single degraded run", () => {
    expect(shouldEmailOperator({ ...base, outcome: "degraded" })).toBe(false)
  })

  it("emails once degradation persists across runs", () => {
    expect(
      shouldEmailOperator({
        ...base,
        outcome: "degraded",
        previousOutcome: "degraded",
      })
    ).toBe(true)
    expect(
      shouldEmailOperator({
        ...base,
        outcome: "degraded",
        previousOutcome: "failed",
      })
    ).toBe(true)
  })

  it("treats an unknown previous outcome as no pattern", () => {
    // No history, or the lookup failed. Emailing here would fire on the first
    // run of every fresh instance that has one flaky vendor.
    expect(
      shouldEmailOperator({
        ...base,
        outcome: "degraded",
        previousOutcome: null,
      })
    ).toBe(false)
  })

  it("emails when the schedule swallowed runs, healthy run or not", () => {
    expect(shouldEmailOperator({ ...base, missedRuns: 3 })).toBe(true)
  })
})
