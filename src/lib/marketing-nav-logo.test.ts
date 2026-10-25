import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8")
const navSource = source("src/components/marketing/MarketingNav.tsx")

describe("marketing nav logo", () => {
  it("renders a clickable image logo that links home", () => {
    expect(navSource).toContain('className="qc-nav-logo"')
    expect(navSource).toContain('href="/"')
    expect(navSource).toContain('src="/logo.png"')
    expect(navSource).toContain('alt="QuotaCanary"')
    expect(navSource).not.toContain("@/components/brand/Canary")
    expect(existsSync(resolve(process.cwd(), "public/logo.png"))).toBe(true)
  })

  // QUO-171: every lockup leads with the approved Q/canary mark, and the
  // footer no longer borrows the mood illustration as its logo.
  it.each([
    "src/components/marketing/MarketingNav.tsx",
    "src/app/(dashboard)/layout.tsx",
    "src/components/auth/MagicLinkForm.tsx",
    "src/components/marketing/MarketingFooter.tsx",
  ])("%s uses the shared logo mark", (path) => {
    const file = source(path)
    expect(file).toContain("<LogoMark")
    expect(file).not.toContain("@/components/brand/Canary")
  })

  it("keeps the mark geometry identical to the exported favicon tile", () => {
    const tile = source("public/favicon.svg")
    const d = tile.match(/ d="([^"]+)"/)?.[1]
    expect(d).toBeTruthy()
    expect(source("src/components/brand/LogoMark.tsx")).toContain(`"${d}"`)
  })
})
