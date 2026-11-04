// QUO-433: the Mac download has one name and one colour everywhere on the
// site. Runs against the built dist/ (npm run build first; CI does). The
// computed colours were checked in a browser at 1280 and 375; this pins the
// markup and the stylesheet rule that would split them again.
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const dist = new URL("../dist/", import.meta.url).pathname
const pages = readdirSync(dist, { recursive: true }).filter((f) => f.endsWith(".html"))
const css = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8")
const text = (inner) =>
  inner
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()

describe("one Download control", () => {
  it("names every download link Download", () => {
    let seen = 0
    for (const page of pages) {
      // The footer's "Mac app" is a product link in a column of links, not a control.
      const html = readFileSync(join(dist, page), "utf8").replace(/<footer[\s\S]*?<\/footer>/g, "")
      for (const [, inner] of html.matchAll(/<a\b[^>]*href="(?:\/download\/mac|\/#download)"[^>]*>([\s\S]*?)<\/a>/g)) {
        seen++
        assert.equal(text(inner), "Download", `${page}: ${text(inner)}`)
      }
    }
    assert.ok(seen > 0, "no download links in dist/")
  })

  it("never says Get the bird", () => {
    for (const page of pages) {
      assert.doesNotMatch(readFileSync(join(dist, page), "utf8"), /Get the bird/, page)
    }
  })

  it("keeps the hero button gold, not ink", () => {
    assert.doesNotMatch(css, /download-button\.primary\{background:var\(--ink\)/)
  })
})
