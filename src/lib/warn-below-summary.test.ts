import type { ConnectionWithBalance, PoolView } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { warnBelowSummary } from "./warn-below-summary"

function conn(
  overrides: Partial<ConnectionWithBalance> = {},
  tool: { low: number | null; critical: number | null } = {
    low: 900,
    critical: 300,
  }
): ConnectionWithBalance {
  return {
    name: "Instantly",
    low_threshold: null,
    alert_threshold: null,
    pool_thresholds: null,
    tool: {
      id: "t",
      name: "T",
      logo_url: null,
      topup_url: null,
      default_low_threshold: tool.low,
      default_alert_threshold: tool.critical,
    },
    ...overrides,
  } as ConnectionWithBalance
}

function pool(overrides: Partial<PoolView> = {}): PoolView {
  return {
    creditType: "primary",
    label: "Primary Credits",
    unit: "credits",
    balance: 5000,
    balanceLimit: null,
    recorded_at: "2026-10-04T00:00:00.000Z",
    history: [],
    ...overrides,
  }
}

describe("warnBelowSummary", () => {
  it("shows the tool default with its red point", () => {
    expect(warnBelowSummary(conn(), pool())).toEqual({
      number: "900",
      text: "Warn below 900",
      detail: "red at 300",
      source: "default",
      label:
        "Warn below 900, red at 300, default. Change it for Instantly, Primary Credits",
    })
  })

  it("marks a number set on the balance itself", () => {
    const c = conn({
      pool_thresholds: { primary: { low: 800, critical: 200 } },
    })
    expect(warnBelowSummary(c, pool())).toMatchObject({
      number: "800",
      detail: "red at 200",
      source: "this balance",
    })
  })

  it("marks a number set on the whole connection", () => {
    const c = conn({ low_threshold: 500, alert_threshold: 100 })
    expect(warnBelowSummary(c, pool())).toMatchObject({
      number: "500",
      detail: "red at 100",
      source: "all balances",
    })
  })

  it("formats in the balance's own unit", () => {
    const c = conn({}, { low: 15, critical: 5 })
    expect(warnBelowSummary(c, pool({ unit: "usd" }))).toMatchObject({
      number: "$15.00",
      detail: "red at $5.00",
    })
  })

  it("offers to set a warning when no number resolves", () => {
    const c = conn({}, { low: null, critical: 1000 })
    expect(warnBelowSummary(c, pool())).toEqual({
      number: null,
      text: "Set a warning",
      detail: "red at 1,000",
      source: null,
      label: "Set a warning for Instantly, Primary Credits",
    })
  })

  it("keeps the visible text inside the accessible name", () => {
    for (const c of [conn(), conn({}, { low: null, critical: null })]) {
      const summary = warnBelowSummary(c, pool())
      expect(summary.label).toContain(summary.text)
    }
  })

  it("never says pool", () => {
    const c = conn({
      pool_thresholds: { primary: { low: 800, critical: 200 } },
    })
    expect(JSON.stringify(warnBelowSummary(c, pool()))).not.toMatch(/pool/i)
  })
})
