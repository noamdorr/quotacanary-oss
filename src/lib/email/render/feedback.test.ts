import { describe, expect, it } from "vitest"
import { renderFeedbackEmail } from "./feedback"

const base = {
  category: "bug" as const,
  message: "The sparkline is blank.",
  toolName: null,
  pagePath: "/dashboard",
  appVersion: "1.0.6",
  userEmail: "someone@example.com",
}

describe("renderFeedbackEmail", () => {
  it("labels the subject by category", () => {
    expect(renderFeedbackEmail(base).subject).toBe("[QuotaCanary] Bug report")
    expect(renderFeedbackEmail({ ...base, category: "feedback" }).subject).toBe(
      "[QuotaCanary] Feedback"
    )
  })

  it("names the tool in a tool request's subject so triage needs no click", () => {
    const { subject } = renderFeedbackEmail({
      ...base,
      category: "tool",
      toolName: "Clay",
    })
    expect(subject).toBe("[QuotaCanary] Tool request: Clay")
  })

  it("carries the triage context: who, where, which build", () => {
    const { text } = renderFeedbackEmail(base)
    expect(text).toContain("From: someone@example.com")
    expect(text).toContain("Page: /dashboard")
    expect(text).toContain("Version: 1.0.6")
  })

  it("escapes the message so free text can't become markup in the inbox", () => {
    const { html } = renderFeedbackEmail({
      ...base,
      message: "<img src=x onerror=alert(1)>",
    })
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
  })

  it("escapes the reporter's address too", () => {
    const { html } = renderFeedbackEmail({
      ...base,
      userEmail: '"><script>alert(1)</script>',
    })
    expect(html).not.toContain("<script>")
  })

  it("says unknown rather than blank when context is missing", () => {
    const { text } = renderFeedbackEmail({
      ...base,
      pagePath: null,
      userEmail: null,
    })
    expect(text).toContain("From: unknown")
    expect(text).toContain("Page: unknown")
  })
})
