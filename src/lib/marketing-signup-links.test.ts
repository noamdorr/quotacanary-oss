import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const navSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/MarketingNav.tsx"),
  "utf8"
)
const heroSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/HeroEditorial.tsx"),
  "utf8"
)
const pricingSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/Pricing.tsx"),
  "utf8"
)
const finalCtaSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/FinalCta.tsx"),
  "utf8"
)
const directorySource = readFileSync(
  resolve(process.cwd(), "src/app/(marketing)/directory/[id]/page.tsx"),
  "utf8"
)

describe("marketing signup links", () => {
  it("sends signup CTAs to the signup tab on the shared auth page", () => {
    for (const source of [
      navSource,
      heroSource,
      pricingSource,
      finalCtaSource,
      directorySource,
    ]) {
      expect(source).toContain("APP_SIGNUP_URL")
    }
  })

  it("keeps sign-in links on the login tab", () => {
    expect(navSource).toContain("APP_LOGIN_URL")
  })
})
