import { describe, expect, it } from "vitest"
import { parseStatusFilter } from "./status-filter"

describe("parseStatusFilter", () => {
  it("returns no filter for null input", () => {
    expect(parseStatusFilter(null)).toEqual({ ok: true, statuses: null })
  })

  it("returns no filter for empty string", () => {
    expect(parseStatusFilter("")).toEqual({ ok: true, statuses: null })
  })

  it("returns no filter for whitespace-only string", () => {
    expect(parseStatusFilter("   ")).toEqual({ ok: true, statuses: null })
  })

  it("parses a single valid status", () => {
    const result = parseStatusFilter("low")
    expect(result).toEqual({ ok: true, statuses: new Set(["low"]) })
  })

  it("parses multiple valid statuses", () => {
    const result = parseStatusFilter("low,critical")
    expect(result).toEqual({
      ok: true,
      statuses: new Set(["low", "critical"]),
    })
  })

  it("trims whitespace around each value", () => {
    const result = parseStatusFilter("low , critical")
    expect(result).toEqual({
      ok: true,
      statuses: new Set(["low", "critical"]),
    })
  })

  it("returns ok: false for any invalid status value", () => {
    expect(parseStatusFilter("low,bogus")).toEqual({ ok: false })
  })

  it("returns ok: false for a completely unknown value", () => {
    expect(parseStatusFilter("running")).toEqual({ ok: false })
  })

  it("returns ok: false when all values are invalid", () => {
    expect(parseStatusFilter("foo,bar")).toEqual({ ok: false })
  })

  it("accepts all known statuses", () => {
    const all = "healthy,low,critical,stale,error,disconnected,nodata"
    const result = parseStatusFilter(all)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.statuses).toEqual(
        new Set([
          "healthy",
          "low",
          "critical",
          "stale",
          "error",
          "disconnected",
          "nodata",
        ])
      )
    }
  })

  it("handles duplicate values (Set deduplicates)", () => {
    const result = parseStatusFilter("low,low,critical")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.statuses?.size).toBe(2)
    }
  })
})
