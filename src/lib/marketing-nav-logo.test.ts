import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const navSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/MarketingNav.tsx"),
  "utf8"
)

describe("marketing nav logo", () => {
  it("renders a clickable image logo that links home", () => {
    expect(navSource).toContain('className="qc-nav-logo"')
    expect(navSource).toContain('href="/"')
    expect(navSource).toContain('src="/logo.png"')
    expect(navSource).toContain('alt="QuotaCanary"')
    expect(navSource).not.toContain("@/components/brand/Canary")
    expect(existsSync(resolve(process.cwd(), "public/logo.png"))).toBe(true)
  })
})
