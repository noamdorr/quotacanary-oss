import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("dashboard relative timestamps", () => {
  it("marks the Updated cell as hydration-safe, since formatWhen reads Date.now()", () => {
    const row = source("src/components/dashboard/ConnectionRow.tsx")

    expect(row).toMatch(/suppressHydrationWarning\s*>\s*\{formatWhen\(/)
  })
})
