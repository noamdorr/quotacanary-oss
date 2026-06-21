import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/BurnRateHero.tsx"),
  "utf8"
)

describe("dashboard burn-rate hero", () => {
  it("uses the singing canary from the homepage", () => {
    expect(source).toContain('Canary mood="singing"')
  })

  it("surfaces a top-up action when the tool provides one", () => {
    expect(source).toContain("c.tool.topup_url")
    expect(source).toContain("Get more")
    expect(source).toContain("ExternalLink")
  })
})
