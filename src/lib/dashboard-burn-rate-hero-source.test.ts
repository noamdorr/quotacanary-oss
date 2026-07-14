import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/BurnRateHero.tsx"),
  "utf8"
)

describe("dashboard burn-rate hero", () => {
  it("renders the canary with a state-derived mood, not a hardcoded one", () => {
    // The bird follows its lore: perched when healthy, singing while a
    // warning is live, dry when the pool is empty, alert on untrusted reads.
    expect(source).toContain("Canary mood={mood}")
    expect(source).toContain('let mood: CanaryMood = "alert"')
    expect(source).toContain('? "perched"')
    expect(source).toContain(': "singing"')
    expect(source).toContain('? "dry"')
  })

  it("surfaces a top-up action when the tool provides one", () => {
    expect(source).toContain("c.tool.topup_url")
    expect(source).toContain("Get more")
    expect(source).toContain("ExternalLink")
  })
})
