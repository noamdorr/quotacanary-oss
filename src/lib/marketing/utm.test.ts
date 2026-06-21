import { describe, expect, it } from "vitest"
import { withUtm } from "./utm"

describe("withUtm", () => {
  it("adds utm_source and utm_medium to a bare URL", () => {
    expect(withUtm("https://hunter.io/billing")).toBe(
      "https://hunter.io/billing?utm_source=quotacanary&utm_medium=directory"
    )
  })

  it("preserves an existing query string", () => {
    expect(withUtm("https://x.com/p?ref=1")).toBe(
      "https://x.com/p?ref=1&utm_source=quotacanary&utm_medium=directory"
    )
  })

  it("keeps the hash fragment at the end", () => {
    expect(withUtm("https://x.com/p#pricing")).toBe(
      "https://x.com/p?utm_source=quotacanary&utm_medium=directory#pricing"
    )
  })

  it("allows overriding source and medium", () => {
    expect(
      withUtm("https://x.com", { source: "qc", medium: "tool-page" })
    ).toBe("https://x.com/?utm_source=qc&utm_medium=tool-page")
  })

  it("returns the input untouched when it is not a valid URL", () => {
    expect(withUtm("not a url")).toBe("not a url")
  })

  it("returns an empty string for null/undefined", () => {
    expect(withUtm(null)).toBe("")
    expect(withUtm(undefined)).toBe("")
  })
})
