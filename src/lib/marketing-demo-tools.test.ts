import { describe, expect, it } from "vitest"

import { HERO_DEMO_TOOLS } from "@/lib/marketing-demo-tools"

describe("hero demo tools", () => {
  it("uses real logo assets for every visible demo row", () => {
    expect(HERO_DEMO_TOOLS).toHaveLength(5)
    expect(HERO_DEMO_TOOLS.map((tool) => tool.logo)).toEqual([
      "/logos/hunter.png",
      "/logos/openrouter.png",
      "/logos/neverbounce.png",
      "/logos/scraperapi.png",
      "/logos/brightdata.png",
    ])
  })
})
