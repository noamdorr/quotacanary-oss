import { describe, expect, it } from "vitest"
import { renderWelcomeEmail } from "./welcome"

describe("renderWelcomeEmail", () => {
  const model = { dashboardUrl: "https://selfhost.example/dashboard" }

  it("includes a subject", () => {
    expect(renderWelcomeEmail(model).subject.length).toBeGreaterThan(0)
  })

  it("links the dashboard in both html and text", () => {
    const { html, text } = renderWelcomeEmail(model)
    expect(html).toContain("https://selfhost.example/dashboard")
    expect(text).toContain("https://selfhost.example/dashboard")
  })

  it("provides a plain-text alternative", () => {
    const { text } = renderWelcomeEmail(model)
    expect(text.length).toBeGreaterThan(0)
  })
})
