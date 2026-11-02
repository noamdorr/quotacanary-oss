// QUO-417: each directory page shows the request the Mac app makes for that
// tool. The declarative half is a snapshot of the Mac catalog; the hand-written
// half is a list in src/lib/requests.mjs, guarded here against drift.
// The page checks run against the built dist/ (npm run build first; CI does).
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { describe, it } from "node:test"
import { macToolIds } from "../scripts/mac-tools.mjs"
import { DECLARATIVE, HAND_WRITTEN, requestsFor } from "../src/lib/requests.mjs"

const core = new URL("../../mac/Sources/QuotaCanaryCore/", import.meta.url)
const catalog = JSON.parse(readFileSync(new URL("Resources/tools.json", core), "utf8"))
const page = (id) => readFileSync(new URL(`../dist/directory/${id}.html`, import.meta.url), "utf8")

// The Swift source declaring `static let id: ProviderID = .member` for a raw id.
function swiftSourceFor(id) {
  const models = readFileSync(new URL("Models.swift", core), "utf8")
  const member = [...models.matchAll(/static let (\w+) = ProviderID\("([^"]+)"\)/g)].find((m) => m[2] === id)?.[1]
  for (const file of readdirSync(core).filter((name) => name.endsWith(".swift"))) {
    const source = readFileSync(new URL(file, core), "utf8")
    if (member && source.includes(`static let id: ProviderID = .${member}`)) return source
  }
  return null
}

describe("request snapshot", () => {
  it("matches the Mac catalog (regenerate src/data/requests.json)", () => {
    const expected = Object.fromEntries(
      catalog.tools.map((tool) => [
        tool.id,
        {
          method: tool.request.method,
          url: tool.request.url,
          in: tool.auth.in,
          ...(tool.auth.name ? { name: tool.auth.name } : {}),
        },
      ])
    )
    assert.deepEqual(DECLARATIVE, expected)
  })

  it("covers every tool the Mac app supports, and nothing else", () => {
    const ids = macToolIds()
    for (const id of ids) assert.ok(requestsFor(id), `${id} has no request entry`)
    const known = new Set(ids)
    for (const id of Object.keys(HAND_WRITTEN)) assert.ok(known.has(id), `${id} is not a Mac tool`)
    for (const id of Object.keys(HAND_WRITTEN)) assert.ok(!DECLARATIVE[id], `${id} is declarative; drop it from HAND_WRITTEN`)
  })

  it("names hosts the hand-written Swift adapters actually call", () => {
    for (const [id, entry] of Object.entries(HAND_WRITTEN)) {
      const source = swiftSourceFor(id)
      assert.ok(source, `no Swift adapter for ${id}`)
      for (const [, url] of entry.requests) {
        const { origin } = new URL(url.replace(/\{[^}]*\}/g, "x"))
        assert.ok(source.includes(origin), `${id}: ${origin} not in its Swift adapter`)
      }
    }
  })
})

describe("tool page request line", () => {
  it("shows a header tool's URL and header", () => {
    const html = page("hunter")
    assert.match(html, /<code>GET https:\/\/api\.hunter\.io\/v2\/account<\/code>/)
    assert.match(html, /goes in the Authorization header\./)
  })

  it("shows a key-in-URL tool with the key placeholder", () => {
    assert.match(page("shodan"), /<code>GET https:\/\/api\.shodan\.io\/api-info\?key=\{key\}<\/code>/)
  })

  it("shows every request of a hand-written multi-step adapter", () => {
    const html = page("snov")
    assert.match(html, /POST https:\/\/api\.snov\.io\/v1\/oauth\/access_token/)
    assert.match(html, /GET https:\/\/api\.snov\.io\/v1\/get-balance/)
  })
})
