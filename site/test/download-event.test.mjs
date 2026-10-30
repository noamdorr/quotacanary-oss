// The launch download metric (QUO-55) is a Plausible tagged-link event: the
// analytics script fires "Mac Download Click" for a click on an element whose
// class carries plausible-event-name, and it fires for ANY element with that
// class, link or not. So the class may only sit on a real link to the artifact,
// never on the disabled "Coming soon" span or an in-page jump like #download.
// Runs against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const dist = new URL("../dist/", import.meta.url).pathname
const pages = readdirSync(dist, { recursive: true }).filter((f) => f.endsWith(".html"))
const tagged = (html) => html.match(/<[a-z]+\b[^>]*plausible-event-[^>]*>/g) ?? []

describe("download event tagging", () => {
  it("found pages to check", () => {
    assert.ok(pages.length > 0, "no dist/*.html; run npm run build first")
  })

  for (const page of pages) {
    it(`${page} tags only real outbound download links`, () => {
      for (const tag of tagged(readFileSync(join(dist, page), "utf8"))) {
        assert.match(tag, /^<a\b/, `tagged non-link: ${tag}`)
        // An artifact URL: absolute https (a GitHub release asset) or a site
        // path like /mac/... (QUO-142 picks), never an in-page #jump.
        assert.match(tag, /\bhref="(?:https:\/\/|\/)[^"#]+"/, `tagged link without an artifact URL: ${tag}`)
        assert.doesNotMatch(tag, /aria-disabled/, `tagged disabled control: ${tag}`)
        assert.match(tag, /plausible-event-name=Mac\+Download\+Click[\s"]/, `unexpected event: ${tag}`)
      }
    })
  }

  it("keeps the disabled control untagged while there is no public build", () => {
    const home = readFileSync(join(dist, "index.html"), "utf8")
    const disabled = home.match(/<span[^>]*download-button[^>]*>/g) ?? []
    const links = home.match(/<a[^>]*download-button[^>]*>/g) ?? []
    // Exactly one shape per build: two disabled spans, or two tagged links.
    assert.equal(disabled.length + links.length, 2)
    for (const span of disabled) assert.doesNotMatch(span, /plausible-event-/)
    for (const link of links) assert.match(link, /plausible-event-name=Mac\+Download\+Click/)
  })
})
