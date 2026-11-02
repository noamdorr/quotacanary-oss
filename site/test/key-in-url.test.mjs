// QUO-407: tools whose key travels in the request URL carry a note on their
// directory page. The declarative half is derived from the Mac catalog; this
// test guards the hand-written Swift half against a new adapter going unlisted.
// The page checks run against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { describe, it } from "node:test"
import { macToolIds } from "../scripts/mac-tools.mjs"
import { DECLARATIVE_KEY_IN_URL, HAND_WRITTEN_KEY_IN_URL, KEY_IN_URL } from "../src/lib/key-in-url.mjs"

const core = new URL("../../mac/Sources/QuotaCanaryCore/", import.meta.url)
const catalog = JSON.parse(readFileSync(new URL("Resources/tools.json", core), "utf8"))
const page = (id) => readFileSync(new URL(`../dist/directory/${id}.html`, import.meta.url), "utf8")

// A provider whose URL literal interpolates a secret after a `?` or `&`.
function swiftKeyInUrl() {
  const out = []
  for (const file of readdirSync(core).filter((name) => name.endsWith(".swift"))) {
    const source = readFileSync(new URL(file, core), "utf8")
    const id = source.match(/static let id: ProviderID = \.(\w+)/)
    if (id && /URL\(string: "[^"\n]*[?&]\w+=\\\(CredentialFields\.pathSegment\(/.test(source)) out.push(id[1])
  }
  return out.sort()
}

describe("key-in-URL list", () => {
  it("snapshot matches the Mac catalog's query and path auth (regenerate src/data/key-in-url.json)", () => {
    const fromCatalog = catalog.tools.filter((tool) => ["query", "path"].includes(tool.auth?.in)).map((tool) => tool.id)
    assert.deepEqual([...DECLARATIVE_KEY_IN_URL], fromCatalog)
  })

  it("lists exactly the Swift adapters that put a secret in the query string", () => {
    assert.deepEqual(swiftKeyInUrl(), [...HAND_WRITTEN_KEY_IN_URL].sort())
  })

  it("names only tools the Mac app supports", () => {
    const known = new Set(macToolIds())
    for (const id of KEY_IN_URL) assert.ok(known.has(id), `${id} is not a Mac tool`)
  })

  it("covers the 27 tools audited on 2026-11-02", () => {
    assert.equal(KEY_IN_URL.size, 27)
  })
})

describe("tool page key-in-URL note", () => {
  it("shows on a flagged tool", () => {
    assert.match(page("serpapi"), /class="tool-key-url"/)
    assert.match(page("zerobounce"), /class="tool-key-url"/)
  })

  it("stays off an unflagged tool, including header-auth tools with an account id in the path", () => {
    assert.doesNotMatch(page("hubspot"), /tool-key-url/)
    assert.doesNotMatch(page("twilio"), /tool-key-url/)
  })
})
