import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  WCAG_AA_LARGE_TEXT,
  WCAG_AA_NORMAL_TEXT,
  contrastRatio,
} from "./contrast"

// Keep the shared gold tokens readable on cream and the dark auth panel.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

const globals = read("src/app/globals.css")

function token(name: string): string {
  const match = globals.match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`)
  )
  if (!match) throw new Error(`Token --${name} not found in globals.css`)
  return match[1]
}

const CREAM_BACKGROUNDS = ["cream", "cream-2", "cream-3"]

describe("Canary Gold contrast", () => {
  it("has a text-safe gold that clears AA on every cream background", () => {
    for (const bg of CREAM_BACKGROUNDS) {
      const ratio = contrastRatio(token("canary-ink"), token(bg))
      expect(
        ratio,
        `--canary-ink on --${bg} is ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT)
    }
  })

  it("documents why the decorative golds cannot be text on cream", () => {
    // Not a lament: this is the regression guard. If someone ever "fixes"
    // --canary-deep by darkening it, this test tells them the text token is
    // the one to reach for, and the assertion below stops being true.
    expect(contrastRatio(token("canary"), token("cream"))).toBeLessThan(
      WCAG_AA_LARGE_TEXT
    )
    expect(contrastRatio(token("canary-deep"), token("cream"))).toBeLessThan(
      WCAG_AA_NORMAL_TEXT
    )
  })

  it("keeps the decorative golds readable on the dark auth panel", () => {
    // --canary-ink must NOT be used there; it drops to ~3.3:1 on --ink.
    expect(contrastRatio(token("canary"), token("ink"))).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT
    )
    expect(
      contrastRatio(token("canary-deep"), token("ink"))
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT)
  })
})
