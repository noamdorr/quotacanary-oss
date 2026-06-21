import type { Tool } from "@/lib/types"
import { describe, expect, it } from "vitest"
import {
  categoryLabel,
  sortToolsForDirectory,
  toolSubheading,
  toolWebsiteUrl,
} from "./tool-directory"

const tool = (id: string, name: string, category: string | null): Tool => ({
  id,
  name,
  logo_url: null,
  api_docs_url: null,
  key_instructions: null,
  category,
  description: null,
  website_url: null,
  integration_type: "api",
  default_alert_threshold: null,
  default_low_threshold: null,
  topup_url: null,
  is_active: true,
  pools: null,
  credential_fields: null,
})

describe("categoryLabel", () => {
  it("maps known categories to display labels", () => {
    expect(categoryLabel("email_verification")).toBe("Email verification")
    expect(categoryLabel("email_finding")).toBe("Email finding")
    expect(categoryLabel("data")).toBe("Web data")
    expect(categoryLabel("ai")).toBe("LLMs")
  })
  it("title-cases unknown categories", () => {
    expect(categoryLabel("email_warmup")).toBe("Email Warmup")
  })
  it("returns Other for null", () => {
    expect(categoryLabel(null)).toBe("Other")
  })
})

describe("toolSubheading", () => {
  it("builds the SEO subheading from the tool name", () => {
    expect(toolSubheading("Hunter")).toBe(
      "Check your Hunter credit balance and burn rate"
    )
  })
})

describe("toolWebsiteUrl", () => {
  it("prefers an explicit website_url over the derived root", () => {
    expect(
      toolWebsiteUrl({
        website_url: "https://deepseek.com",
        topup_url: null,
        api_docs_url: "https://api-docs.deepseek.com/",
      })
    ).toBe("https://deepseek.com")
  })

  it("derives a root website from API docs", () => {
    expect(
      toolWebsiteUrl({
        website_url: null,
        topup_url: null,
        api_docs_url: "https://hunter.io/api-documentation/v2",
      })
    ).toBe("https://hunter.io/")
  })

  it("strips service subdomains from docs and app links", () => {
    expect(
      toolWebsiteUrl({
        website_url: null,
        topup_url: null,
        api_docs_url:
          "https://docs.usebouncer.com/api-reference/credits/credits",
      })
    ).toBe("https://usebouncer.com/")
    expect(
      toolWebsiteUrl({
        website_url: null,
        topup_url: "https://app.dataforseo.com/billing",
        api_docs_url: null,
      })
    ).toBe("https://dataforseo.com/")
  })

  it("returns null when no usable URL exists", () => {
    expect(
      toolWebsiteUrl({ website_url: null, topup_url: null, api_docs_url: null })
    ).toBeNull()
    expect(
      toolWebsiteUrl({
        website_url: null,
        topup_url: "nope",
        api_docs_url: null,
      })
    ).toBeNull()
  })
})

describe("sortToolsForDirectory", () => {
  it("orders by category rank, then name", () => {
    const sorted = sortToolsForDirectory([
      tool("d", "DeepSeek", "ai"),
      tool("z", "ZeroBounce", "email_verification"),
      tool("a", "Apify", "data"),
      tool("n", "NeverBounce", "email_verification"),
    ])
    expect(sorted.map((t) => t.id)).toEqual(["n", "z", "a", "d"])
  })
})
