import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { catalogAdapters, catalogJsonSchema, catalogSchema } from "./catalog"
import { HAND_WRITTEN_TOOL_IDS } from "./registry"

const root = process.cwd()
const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"))

// The ids with is_active = true in seed.sql, parsed the same way
// marketing-rotating-tools.test.ts does (no live Supabase in Vitest).
function activeSeedToolIds(): string[] {
  const seed = readFileSync(resolve(root, "supabase/seed.sql"), "utf8")
  return [
    ...seed.matchAll(
      /\(\s*'([^']+)',\s*'(?:[^']|'')*',\s*'\/logos\/[^']+',[\s\S]*?,\s*(true|false)\s*\)/g
    ),
  ]
    .filter((row) => row[2] === "true")
    .map((row) => row[1])
    .sort()
}

describe("catalog/tools.json", () => {
  it("validates against the catalog schema", () => {
    expect(() =>
      catalogSchema.parse(readJson("catalog/tools.json"))
    ).not.toThrow()
  })

  it("gives every tool a top-up URL, so the Mac app can offer Top up locally", () => {
    const missing = catalogSchema
      .parse(readJson("catalog/tools.json"))
      .tools.filter((tool) => !tool.topupUrl)
      .map((tool) => tool.id)
    expect(missing).toEqual([])
  })

  it("ships the schema the interpreter was built from (regenerate with catalogJsonSchema)", () => {
    expect(readJson("catalog/tools.schema.json")).toEqual(catalogJsonSchema())
  })
})

describe("adapter coverage", () => {
  it("resolves every active seed tool to exactly one of catalog entry or hand-written adapter", () => {
    const catalogIds = new Set(Object.keys(catalogAdapters()))
    const handWrittenIds = new Set(HAND_WRITTEN_TOOL_IDS)
    const seedIds = activeSeedToolIds()
    expect(seedIds.length).toBeGreaterThanOrEqual(50)

    const missing = seedIds.filter(
      (id) => !catalogIds.has(id) && !handWrittenIds.has(id)
    )
    const doubled = seedIds.filter(
      (id) => catalogIds.has(id) && handWrittenIds.has(id)
    )
    expect({ missing, doubled }).toEqual({ missing: [], doubled: [] })
  })

  it("has no adapter without an active seed row", () => {
    const seedIds = new Set(activeSeedToolIds())
    const orphans = [
      ...Object.keys(catalogAdapters()),
      ...HAND_WRITTEN_TOOL_IDS,
    ]
      .filter((id) => !seedIds.has(id))
      .sort()
    expect(orphans).toEqual([])
  })
})
