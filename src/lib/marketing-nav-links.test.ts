import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const navSource = readFileSync(
  resolve(process.cwd(), "src/components/marketing/MarketingNav.tsx"),
  "utf8"
)

describe("marketing nav links", () => {
  it("links homepage sections through the home route so they work from other marketing pages", () => {
    expect(navSource).toContain('href="/#how"')
    expect(navSource).toContain('href="/#pricing"')
    expect(navSource).toContain('href="/#faq"')

    expect(navSource).not.toContain('href="#how"')
    expect(navSource).not.toContain('href="#pricing"')
    expect(navSource).not.toContain('href="#faq"')
  })
})
