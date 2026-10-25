import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const drawer = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/ConnectionDrawer.tsx"),
  "utf8"
)

describe("drawer Warn below field", () => {
  it("shows the red point in the balance's own unit, like the row and card", () => {
    expect(drawer).toContain("formatBalance(n, pool.unit)")
    expect(drawer).not.toMatch(/Turns red at \$\{[^}]*toLocaleString/)
  })

  it("opens a decimal keypad so values like 2.5 can be typed on a phone", () => {
    expect(drawer).toContain('inputMode="decimal"')
    expect(drawer).not.toContain('inputMode="numeric"')
  })
})
