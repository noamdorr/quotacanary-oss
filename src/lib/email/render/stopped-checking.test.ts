import { describe, expect, it } from "vitest"
import { renderStoppedCheckingEmail } from "./stopped-checking"

const base = {
  toolName: "Apollo",
  body: "Apollo rejected the saved key for Apollo main, so its balance isn't being checked.",
  dashboardUrl: "https://selfhost.example/dashboard",
}

describe("renderStoppedCheckingEmail", () => {
  it("names the tool in the subject", () => {
    expect(renderStoppedCheckingEmail(base).subject).toContain("Apollo")
  })

  it("leads with the event body and links the dashboard", () => {
    const { html, text } = renderStoppedCheckingEmail(base)
    expect(html).toContain("Apollo rejected the saved key for Apollo main")
    expect(html).toContain("https://selfhost.example/dashboard")
    expect(text).toContain(base.body)
    expect(text).toContain("https://selfhost.example/dashboard")
  })

  it("escapes a user-named connection in the html", () => {
    const { html } = renderStoppedCheckingEmail({
      ...base,
      body: "<script>x</script> failed 3 checks in a row.",
    })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("uses no em dashes", () => {
    const { subject, html, text } = renderStoppedCheckingEmail(base)
    for (const part of [subject, html, text]) {
      expect(part).not.toContain("—")
    }
  })
})
