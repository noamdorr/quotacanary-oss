// QUO-378: a tool with no key_instructions still names the key it needs, with a
// template fallback (not a catalog value, so the Mac catalog shape stays shared).
// Runs against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const page = (id) => readFileSync(new URL(`../dist/directory/${id}.html`, import.meta.url), "utf8")

describe("tool page key section", () => {
  it("falls back to the generic line when key_instructions is empty", () => {
    assert.match(page("clay"), /<p>Your Clay API key\.<\/p>/)
  })

  it("keeps the tool's own hint when it has one", () => {
    const html = page("hubspot")
    assert.doesNotMatch(html, /Your HubSpot API key\./)
    assert.match(html, /class="tool-key-where"/)
  })
})
