import { describe, expect, it } from "vitest"

import { SIGNATURE_RISK_CARD } from "@/lib/marketing-risk-card"

describe("signature risk card", () => {
  it("shows one concrete tool risk instead of another stack table", () => {
    expect(SIGNATURE_RISK_CARD.name).toBe("Hunter.io")
    expect(SIGNATURE_RISK_CARD.logo).toBe("/logos/hunter.png")
    expect(SIGNATURE_RISK_CARD.verdict).toBe("burns out tomorrow")
    expect(SIGNATURE_RISK_CARD.metrics).toEqual([
      { label: "Balance", value: "120 searches" },
      { label: "Burn rate", value: "240 / day" },
      { label: "Warning at", value: "500 searches" },
    ])
  })
})
