import type { Tool } from "@/lib/types"
import { describe, expect, it } from "vitest"
import { categoryLabel, toolMatchesQuery } from "./tool-directory"

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

describe("toolMatchesQuery", () => {
  const hunter = tool("hunter", "Hunter", "email_finding")

  it("matches tool names and human-readable category labels", () => {
    expect(toolMatchesQuery(hunter, "hunt")).toBe(true)
    expect(toolMatchesQuery(hunter, "email finding")).toBe(true)
  })

  it("normalizes separators and rejects unrelated queries", () => {
    expect(toolMatchesQuery(hunter, "email_finding")).toBe(true)
    expect(toolMatchesQuery(hunter, "web data")).toBe(false)
  })
})
