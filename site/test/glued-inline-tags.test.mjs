// Astro drops a source line break that sits directly before an opening inline
// tag or directly after a closing one, so "Returns\n<code>201</code>" renders as
// "Returns<code>201</code>" and reads "Returns201". Keep the neighbouring word on
// the tag's line. Runs against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const dist = new URL("../dist/", import.meta.url).pathname
const glued =
  /.{0,30}(?:[A-Za-z0-9,.;:)]<(?:code|a|strong|em)[ >]|<\/(?:code|a|strong|em)>[A-Za-z0-9(]).{0,30}/g

const pages = readdirSync(dist, { recursive: true }).filter((f) => f.endsWith(".html"))

describe("rendered pages", () => {
  it("found pages to check", () => {
    assert.ok(pages.length > 0, "no dist/*.html; run npm run build first")
  })

  for (const page of pages) {
    it(`${page} has no word glued to an inline tag`, () => {
      const html = readFileSync(join(dist, page), "utf8")
      assert.deepEqual(html.match(glued) ?? [], [])
    })
  }
})
