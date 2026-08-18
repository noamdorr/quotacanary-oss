import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  WCAG_AA_LARGE_TEXT,
  WCAG_AA_NORMAL_TEXT,
  contrastRatio,
} from "./contrast"

// QUO-19. Two defects, both invisible to a sighted mouse user:
//  1. Collapsed FAQ answers were aria-hidden but still keyboard-focusable, so
//     a keyboard user could tab into a link they could not see.
//  2. Canary Gold was used as TEXT on cream, at ~2:1 against a 4.5:1 bar.
// Vitest runs in node with no DOM, so the disclosure wiring is pinned as a
// source contract (see credential-field-hardening-source.test.ts) while the
// contrast is checked for real against the tokens in globals.css.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")

const globals = read("src/app/globals.css")
const faq = read("src/components/marketing/Faq.tsx")
const howItWorks = read("src/components/marketing/HowItWorks.tsx")

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

  it("uses the text-safe token for HowItWorks copy on cream", () => {
    expect(howItWorks).toContain("var(--canary-ink)")
    expect(howItWorks).not.toContain('color: "var(--canary-deep)"')
  })
})

describe("FAQ disclosure", () => {
  it("removes a collapsed answer from the focus order with inert", () => {
    expect(faq).toContain("inert={!open}")
  })

  it("no longer relies on aria-hidden, which left links focusable", () => {
    expect(faq).not.toContain("aria-hidden={!open}")
  })

  it("wires the button to the panel it controls", () => {
    expect(faq).toContain("aria-expanded={open}")
    expect(faq).toContain("aria-controls={panelId}")
    expect(faq).toContain("id={panelId}")
    expect(faq).toContain("aria-labelledby={buttonId}")
    expect(faq).toContain("id={buttonId}")
  })

  it("names the panel with a semantic section rather than role=region", () => {
    expect(faq).toContain("<section")
    expect(faq).not.toContain('role="region"')
  })

  it("gives each item a stable id so the ids cannot collide", () => {
    expect(faq).toContain("const panelId = `faq-panel-${id}`")
    expect(faq).toContain("const buttonId = `faq-button-${id}`")
    expect(faq).toContain("id={String(i)}")
  })
})
