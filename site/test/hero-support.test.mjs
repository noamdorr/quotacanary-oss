// QUO-384: the hero carries one supporting line between the h1 and the
// download block. Runs against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8")

describe("homepage hero", () => {
  it("puts the supporting line between the h1 and the download block", () => {
    const hero = html.match(
      /<h1 id="hero-title"[^>]*>[^<]+<\/h1>\s*<p class="hero-support"[^>]*>([^<]+)<\/p>\s*<div class="download"/
    )
    assert.ok(hero, "no h1 > p.hero-support > .download sequence in dist/index.html")
    assert.ok(hero[1].trim().length > 0)
    assert.doesNotMatch(hero[1], /—/, "no em dashes in copy")
  })
})
