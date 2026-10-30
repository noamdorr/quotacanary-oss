// The directory is built from src/data/tools.json, and it froze at 66 tools
// once its refresh source was deleted while the Mac app kept growing. This
// keeps the snapshot equal to the set of ids the Mac app supports: a tool
// added to the app without a refresh (npm run tools:pull) fails here.
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { macToolIds } from "../scripts/mac-tools.mjs"

const snapshot = JSON.parse(readFileSync(new URL("../src/data/tools.json", import.meta.url), "utf8"))
const siteIds = new Set(snapshot.map((tool) => tool.id))
const macIds = macToolIds()

describe("directory snapshot matches the Mac app", () => {
  it("lists every tool the Mac app supports", () => {
    const missing = macIds.filter((id) => !siteIds.has(id))
    assert.deepEqual(missing, [], `missing from src/data/tools.json: ${missing.join(", ")}`)
  })

  it("lists nothing the Mac app does not support", () => {
    const mac = new Set(macIds)
    const extra = [...siteIds].filter((id) => !mac.has(id))
    assert.deepEqual(extra, [], `not in the Mac app: ${extra.join(", ")}`)
  })

  it("has one record per id", () => {
    assert.equal(snapshot.length, siteIds.size)
  })

  it("gives every tool a logo that exists in public/", () => {
    const broken = snapshot
      .filter((tool) => !tool.logo_url || !existsSync(new URL(`../public${tool.logo_url}`, import.meta.url)))
      .map((tool) => tool.id)
    assert.deepEqual(broken, [], `no logo file for: ${broken.join(", ")}`)
  })

  it("serves every logo as webp", () => {
    const notWebp = snapshot.filter((tool) => !tool.logo_url?.endsWith(".webp")).map((tool) => tool.id)
    assert.deepEqual(notWebp, [], `logo_url is not .webp for: ${notWebp.join(", ")}`)
  })

  it("keeps the key_instructions field on every record", () => {
    const without = snapshot.filter((tool) => !("key_instructions" in tool)).map((tool) => tool.id)
    assert.deepEqual(without, [])
  })
})
