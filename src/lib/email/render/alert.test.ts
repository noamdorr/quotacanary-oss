import { describe, expect, it } from "vitest"
import { renderAlertEmail } from "./alert"

const base = {
  toolName: "Hunter",
  dashboardUrl: "https://app.quotacanary.com/dashboard",
  pools: [
    { label: "Searches", balance: 1200, threshold: 2000, unit: "searches" },
  ],
}

describe("renderAlertEmail", () => {
  it("uses a heads-up subject for low", () => {
    expect(renderAlertEmail({ ...base, severity: "low" }).subject).toBe(
      "Heads up: Hunter is running low"
    )
  })
  it("uses an almost-out subject for critical", () => {
    expect(renderAlertEmail({ ...base, severity: "critical" }).subject).toBe(
      "Hunter is almost out of credits"
    )
  })
  it("includes balance, threshold and dashboard link in the html", () => {
    const { html } = renderAlertEmail({ ...base, severity: "low" })
    expect(html).toContain("Hunter")
    expect(html).toContain("1,200")
    expect(html).toContain("2,000")
    expect(html).toContain("https://app.quotacanary.com/dashboard")
  })
  it("provides a plain-text alternative", () => {
    const { text } = renderAlertEmail({ ...base, severity: "low" })
    expect(text).toContain("Searches")
    expect(text).toContain("1,200")
  })
  it("includes a top-up link when provided", () => {
    const { html } = renderAlertEmail({
      ...base,
      severity: "critical",
      topupUrl: "https://hunter.io/billing",
    })
    expect(html).toContain("https://hunter.io/billing")
  })
})
