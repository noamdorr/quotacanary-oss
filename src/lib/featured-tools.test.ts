import { describe, expect, it } from "vitest"
import { type FeaturedTool, resolveFeaturedTools } from "./featured-tools"

function tool(id: string): FeaturedTool {
  return {
    id,
    name: id,
    logo_url: null,
    key_instructions: null,
    default_low_threshold: null,
    default_alert_threshold: null,
    pools: null,
    credential_fields: null,
  }
}

describe("resolveFeaturedTools", () => {
  it("returns the featured ids in order when all are present", () => {
    const active = [
      tool("zzz"),
      tool("scraperapi"),
      tool("hunter"),
      tool("openrouter"),
      tool("neverbounce"),
    ]
    expect(resolveFeaturedTools(active).map((t) => t.id)).toEqual([
      "hunter",
      "neverbounce",
      "openrouter",
      "scraperapi",
    ])
  })

  it("pads with other active tools when a featured id is missing", () => {
    const active = [
      tool("hunter"),
      tool("neverbounce"),
      tool("aaa"),
      tool("bbb"),
    ]
    expect(resolveFeaturedTools(active).map((t) => t.id)).toEqual([
      "hunter",
      "neverbounce",
      "aaa",
      "bbb",
    ])
  })

  it("returns at most 4 and never duplicates", () => {
    const active = [
      tool("hunter"),
      tool("neverbounce"),
      tool("openrouter"),
      tool("scraperapi"),
      tool("extra"),
    ]
    const out = resolveFeaturedTools(active)
    expect(out).toHaveLength(4)
    expect(new Set(out.map((t) => t.id)).size).toBe(4)
  })

  it("returns empty when there are no active tools", () => {
    expect(resolveFeaturedTools([])).toEqual([])
  })
})
