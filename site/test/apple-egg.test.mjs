// QUO-428: hovering the hero's mock Apple logo eats it down to the core, and
// clicking it drops a fake Apple menu whose copy Noam approved verbatim.
// Runs against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8")

const approved = [
  "About This Mac (3 credits left)",
  "System Settings...",
  "---",
  "Top Up Everything...",
  "Recent Burns",
  "---",
  "Force Quit Apollo",
  "---",
  "Sleep (QuotaCanary won't)",
  "Restart Free Trial",
  "Shut Down Before Renewal...",
]

describe("hero Apple easter egg", () => {
  it("ships the approved fake Apple menu, in order", () => {
    const menu = html.match(/<div class="desk-apple-menu"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/)
    assert.ok(menu, "no .desk-apple-menu in dist/index.html")
    const items = [...menu[1].matchAll(/<div class="dp-(item|sep)"[^>]*>(?:<span>([^<]*)<\/span>)?/g)].map(
      ([, kind, text]) => (kind === "sep" ? "---" : text.replace(/&#39;|&#x27;/g, "'"))
    )
    assert.deepEqual(items, approved)
  })

  it("keeps the egg out of the accessibility tree", () => {
    assert.match(html, /<div class="desk-apple-menu"[^>]*aria-hidden="true"/)
    assert.match(html, /<span class="desk-bar-left" aria-hidden="true">\s*<span class="desk-apple"/)
  })

  it("draws three bite frames over the Apple", () => {
    for (const frame of [1, 2, 3]) assert.match(html, new RegExp(`<g class="bite-${frame}"`))
  })
})
