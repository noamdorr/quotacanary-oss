import { describe, expect, it } from "vitest"
import type { AlertEvaluation } from "./severity"
import {
  advancedNotifiedLevels,
  escalation,
  evaluateSeverity,
  rearmedNotifiedLevels,
  rollupNotifiedLevel,
  shouldSendEmail,
} from "./severity"

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

describe("shouldSendEmail", () => {
  it("sends at both levels in low_and_critical mode", () => {
    for (const level of ["low", "critical"] as const) {
      expect(
        shouldSendEmail({
          level,
          notifyMode: "low_and_critical",
          alertEnabled: true,
        })
      ).toBe(true)
    }
  })
  it("critical-only mode ignores the low stage", () => {
    expect(
      shouldSendEmail({
        level: "low",
        notifyMode: "critical",
        alertEnabled: true,
      })
    ).toBe(false)
    expect(
      shouldSendEmail({
        level: "critical",
        notifyMode: "critical",
        alertEnabled: true,
      })
    ).toBe(true)
  })
  it("off mode never sends", () => {
    expect(
      shouldSendEmail({
        level: "critical",
        notifyMode: "off",
        alertEnabled: true,
      })
    ).toBe(false)
  })
  it("disabled connection never sends", () => {
    expect(
      shouldSendEmail({
        level: "critical",
        notifyMode: "low_and_critical",
        alertEnabled: false,
      })
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Per-pool high-water marks (QUO-61)
// ---------------------------------------------------------------------------

function pool(creditType: string, balance: number, low = 50, critical = 10) {
  return { creditType, label: creditType, balance, low, critical, unit: null }
}

function evaluation(
  pools: ReturnType<typeof pool>[],
  notifiedLevels: AlertEvaluation["notifiedLevels"] = {}
): AlertEvaluation {
  return {
    connectionId: "c1",
    userId: "u1",
    toolName: "Apify",
    connectionName: "Apify main",
    topupUrl: null,
    alertEnabled: true,
    severity: evaluateSeverity(pools),
    notifiedLevel: rollupNotifiedLevel(notifiedLevels),
    notifiedLevels,
    pools,
  }
}

describe("escalation", () => {
  it("alerts the first pool to cross", () => {
    const esc = escalation(evaluation([pool("compute", 40), pool("proxy", 90)]))
    expect(esc?.level).toBe("low")
    expect(esc?.pools.map((p) => p.creditType)).toEqual(["compute"])
  })

  it("alerts a second pool crossing the same level on a later day", () => {
    // The QUO-61 bug: with one mark per connection, the connection severity is
    // still 'low' and rank('low') > rank('low') is false, so proxy was silent.
    const esc = escalation(
      evaluation([pool("compute", 40), pool("proxy", 40)], { compute: "low" })
    )
    expect(esc?.level).toBe("low")
    expect(esc?.pools.map((p) => p.creditType)).toEqual(["proxy"])
  })

  it("returns null when every crossing pool is already marked", () => {
    expect(
      escalation(
        evaluation([pool("compute", 40), pool("proxy", 40)], {
          compute: "low",
          proxy: "low",
        })
      )
    ).toBeNull()
  })

  it("escalates a marked pool from low to critical", () => {
    const esc = escalation(evaluation([pool("compute", 5)], { compute: "low" }))
    expect(esc?.level).toBe("critical")
    expect(esc?.pools.map((p) => p.creditType)).toEqual(["compute"])
  })

  it("does not demote a pool marked critical that bobs back to low", () => {
    expect(
      escalation(evaluation([pool("compute", 40)], { compute: "critical" }))
    ).toBeNull()
  })

  it("alerts the highest level reached and leaves the lower crossing pending", () => {
    // Both crossed in the same poll. The critical one owns this alert; compute
    // keeps its mark, so it is still a candidate on the next poll.
    const e = evaluation([pool("compute", 40), pool("proxy", 5)])
    const esc = escalation(e)
    if (!esc) throw new Error("expected an escalation")
    expect(esc.level).toBe("critical")
    expect(esc.pools.map((p) => p.creditType)).toEqual(["proxy"])
    expect(advancedNotifiedLevels(e, esc)).toEqual({ proxy: "critical" })
  })

  it("ignores an unwatched pool entirely", () => {
    // refresh-connection filters to watched_credit_types before evaluating, so
    // an unwatched pool never reaches here and never earns a mark.
    expect(escalation(evaluation([pool("compute", 90)]))).toBeNull()
  })
})

describe("rearmedNotifiedLevels", () => {
  it("drops the mark of a pool that recovered and keeps the rest", () => {
    expect(
      rearmedNotifiedLevels(
        evaluation([pool("compute", 90), pool("proxy", 40)], {
          compute: "low",
          proxy: "low",
        })
      )
    ).toEqual({ proxy: "low" })
  })

  it("drops a mark for a credit_type the connection no longer reports", () => {
    expect(
      rearmedNotifiedLevels(
        evaluation([pool("proxy", 40)], { retired: "low", proxy: "low" })
      )
    ).toEqual({ proxy: "low" })
  })
})

describe("rollupNotifiedLevel", () => {
  it("reports the highest mark in the map", () => {
    expect(rollupNotifiedLevel({})).toBe("none")
    expect(rollupNotifiedLevel({ a: "low", b: "critical" })).toBe("critical")
    expect(rollupNotifiedLevel({ a: "low", b: "low" })).toBe("low")
  })
})
