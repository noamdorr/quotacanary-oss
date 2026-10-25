import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MAGIC_LINK_RETRY_LABEL, MagicLinkSent } from "./MagicLinkSent"

// The sent state used to be a dead end: no way to fix a typo or ask again
// short of reloading the page. Clicks cannot fire in node, so this pins the
// rendered recovery control; the form round trip is checked in the browser.

function render(email: string): string {
  return renderToStaticMarkup(
    createElement(MagicLinkSent, { email, onRetry: () => {} })
  )
}

describe("MagicLinkSent", () => {
  it("keeps the approved sent-to line", () => {
    expect(render("you@example.com")).toContain(
      "A sign-in link is on its way to <strong>you@example.com</strong>."
    )
  })

  it("offers a recovery control that does not submit anything", () => {
    const html = render("you@example.com")
    const button = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/)?.[0] ?? ""
    expect(button).toContain('type="button"')
    expect(button).toContain(MAGIC_LINK_RETRY_LABEL)
  })
})
