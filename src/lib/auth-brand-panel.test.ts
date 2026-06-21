import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/components/auth/AuthBrandPanel.tsx"),
  "utf8"
)
const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8")

describe("auth brand panel", () => {
  it("uses the homepage mascot and risk-card language", () => {
    expect(source).toContain("qc-auth-showcase")
    expect(source).toContain("MASCOT_LINES.auth")
    expect(source).toContain("SIGNATURE_RISK_CARD")
    expect(source).toContain("qc-auth-risk-card")
    expect(source).not.toContain("StatusPill")
  })

  it("keeps the auth showcase visually aligned with the homepage CTA panel", () => {
    expect(css).toContain(".qc-auth-showcase")
    expect(css).toContain("background: var(--cream)")
    expect(css).toContain(".qc-auth-bubble")
    expect(css).toContain(".qc-auth-risk-card")
  })
})
