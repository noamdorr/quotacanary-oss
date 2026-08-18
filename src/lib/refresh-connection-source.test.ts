import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const refreshConnectionPath = resolve(
  process.cwd(),
  "src/lib/refresh-connection.ts"
)
const source = readFileSync(refreshConnectionPath, "utf8")

// A directive only takes effect as the exact first statement in the file -
// checking the whole source for the substring would false-positive on the
// comment here that explains why "use server" must not be present.
function hasDirective(src: string, directive: string): boolean {
  return src
    .split("\n")
    .some(
      (line) =>
        line.trim() === `"${directive}"` || line.trim() === `'${directive}'`
    )
}

const actionsDir = resolve(process.cwd(), "src/lib/actions")
const actionFiles = readdirSync(actionsDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => resolve(actionsDir, f))

describe("refreshConnectionWith is never an auto-exposed server action", () => {
  it('does not carry a "use server" directive itself', () => {
    expect(hasDirective(source, "use server")).toBe(false)
  })

  it("opts in to server-only instead", () => {
    expect(source).toContain('import "server-only"')
  })

  it('is never re-exported from a "use server" actions module', () => {
    for (const file of actionFiles) {
      const actionSource = readFileSync(file, "utf8")
      if (!hasDirective(actionSource, "use server")) continue
      expect(actionSource).not.toMatch(
        /export\s+\{[^}]*refreshConnectionWith[^}]*\}\s+from/
      )
      expect(actionSource).not.toMatch(
        /export\s+\*\s+from\s+["']@\/lib\/refresh-connection["']/
      )
    }
  })
})
