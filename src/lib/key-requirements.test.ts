import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { keyRequirement } from "./key-requirements"

describe("keyRequirement", () => {
  it("keeps the setup requirements a key must meet", () => {
    expect(keyRequirement("apollo")).toContain(
      "api/v1/usage_stats/credit_usage_stats"
    )
    expect(keyRequirement("crawlbase")).toContain("one product slug")
    expect(keyRequirement("crawlbase")).toContain("five minutes between checks")
    expect(keyRequirement("builtwith")).toContain("Agent API Billing")
  })

  it("shows nothing for tools whose hint was only a location", () => {
    for (const id of ["zerobounce", "hunter", "openrouter", "unknown-tool"]) {
      expect(keyRequirement(id)).toBeNull()
    }
  })

  it("matches the Mac app's list word for word", () => {
    const swift = readFileSync(
      resolve(process.cwd(), "mac/Sources/QuotaCanaryCore/Copy.swift"),
      "utf8"
    )
    const mac = Object.fromEntries(
      [...swift.matchAll(/^ {4}"([a-z0-9]+)": "(.*)",$/gm)].map((m) => [
        m[1],
        m[2],
      ])
    )
    expect(Object.keys(mac).length).toBeGreaterThan(10)
    for (const [id, text] of Object.entries(mac)) {
      expect(keyRequirement(id)).toBe(text)
    }
  })
})
