// The tool ids the Mac app supports, read from its source: every entry of the
// bundled catalog plus every hand-written provider in ProviderRegistry's roll
// call. The directory snapshot must match this set exactly (see
// test/mac-parity.test.mjs), so the site cannot fall behind the app again.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const core = new URL("../../mac/Sources/QuotaCanaryCore/", import.meta.url).pathname

export function macToolIds() {
  const catalog = JSON.parse(readFileSync(join(core, "Resources/tools.json"), "utf8"))
  const ids = new Set(catalog.tools.map((tool) => tool.id))
  for (const id of handWrittenIds()) ids.add(id)
  return [...ids].sort()
}

// ProviderRegistry lists types (`OpenRouter.self`); each type declares
// `static let id: ProviderID = .member`, and Models.swift maps the member to
// its raw id (`static let member = ProviderID("raw")`).
function handWrittenIds() {
  const registry = readFileSync(join(core, "ProviderRegistry.swift"), "utf8")
  const rollCall = registry.match(/handWrittenProviders:[^=]*=\s*\[([^\]]*)\]/)
  if (!rollCall) throw new Error("handWrittenProviders roll call not found in ProviderRegistry.swift")
  const types = [...rollCall[1].matchAll(/(\w+)\.self/g)].map((m) => m[1])

  const members = new Map()
  const models = readFileSync(join(core, "Models.swift"), "utf8")
  for (const m of models.matchAll(/static let (\w+) = ProviderID\("([^"]+)"\)/g)) members.set(m[1], m[2])

  const memberOf = new Map()
  for (const file of readdirSync(core).filter((name) => name.endsWith(".swift"))) {
    const source = readFileSync(join(core, file), "utf8")
    for (const m of source.matchAll(
      /(?:struct|enum|class) (\w+)\s*:[^{]*\{[^}]*?static let id: ProviderID = \.(\w+)/g
    )) {
      memberOf.set(m[1], m[2])
    }
  }

  return types.map((type) => {
    const id = members.get(memberOf.get(type))
    if (!id) throw new Error(`no ProviderID found for hand-written provider ${type}`)
    return id
  })
}

// The Mac app's per-tool key hints (Copy.swift `keyRequirements`), by id.
export function macKeyRequirements() {
  const copy = readFileSync(join(core, "Copy.swift"), "utf8")
  const block = copy.match(/static let keyRequirements: \[String: String\] = \[([\s\S]*?)\n\s*\]/)
  if (!block) throw new Error("keyRequirements not found in Copy.swift")
  const out = {}
  for (const m of block[1].matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
    out[m[1]] = m[2].replace(/\\(.)/g, "$1")
  }
  return out
}
