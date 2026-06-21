import { describe, expect, it } from "vitest"
import { getAdapter } from "./registry"

describe("adapter registry", () => {
  it("returns an adapter for a known tool", () => {
    expect(getAdapter("neverbounce")?.toolId).toBe("neverbounce")
    expect(getAdapter("millionverifier")?.toolId).toBe("millionverifier")
    expect(getAdapter("openrouter")?.toolId).toBe("openrouter")
    expect(getAdapter("oppora")?.toolId).toBe("oppora")
    expect(getAdapter("dataforseo")?.toolId).toBe("dataforseo")
    expect(getAdapter("firecrawl")?.toolId).toBe("firecrawl")
    expect(getAdapter("scrapegraphai")?.toolId).toBe("scrapegraphai")
    expect(getAdapter("mailercheck")?.toolId).toBe("mailercheck")
    expect(getAdapter("emailhippo")?.toolId).toBe("emailhippo")
    expect(getAdapter("outscraper")?.toolId).toBe("outscraper")
    expect(getAdapter("orthogonal")?.toolId).toBe("orthogonal")
    expect(getAdapter("tomba")?.toolId).toBe("tomba")
    expect(getAdapter("snov")?.toolId).toBe("snov")
    expect(getAdapter("contactout")?.toolId).toBe("contactout")
    expect(getAdapter("proxycurl")?.toolId).toBe("proxycurl")
    expect(getAdapter("ahrefs")?.toolId).toBe("ahrefs")
    expect(getAdapter("bettercontact")?.toolId).toBe("bettercontact")
    expect(getAdapter("shodan")?.toolId).toBe("shodan")
    expect(getAdapter("verifalia")?.toolId).toBe("verifalia")
    expect(getAdapter("tavily")?.toolId).toBe("tavily")
    expect(getAdapter("enrichcrm")?.toolId).toBe("enrichcrm")
    expect(getAdapter("semrush")?.toolId).toBe("semrush")
    expect(getAdapter("meltly")?.toolId).toBe("meltly")
    expect(getAdapter("skrapp")?.toolId).toBe("skrapp")
  })

  it("returns undefined for an unknown tool", () => {
    expect(getAdapter("nope")).toBeUndefined()
  })
})
