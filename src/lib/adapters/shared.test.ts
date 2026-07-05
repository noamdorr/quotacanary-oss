import { describe, expect, it } from "vitest"
import { finiteOrNull, toFiniteNumber } from "./shared"

describe("toFiniteNumber", () => {
  it("returns a normal number unchanged", () => {
    expect(toFiniteNumber(4200)).toBe(4200)
  })

  it("coerces a numeric string", () => {
    expect(toFiniteNumber("9800")).toBe(9800)
  })

  it("falls back on null", () => {
    expect(toFiniteNumber(null)).toBe(0)
  })

  it("falls back on undefined", () => {
    expect(toFiniteNumber(undefined)).toBe(0)
  })

  it("falls back on a non-numeric string", () => {
    expect(toFiniteNumber("abc")).toBe(0)
  })

  it("uses the provided fallback", () => {
    expect(toFiniteNumber("abc", -1)).toBe(-1)
  })
})

describe("finiteOrNull", () => {
  it("returns a normal number unchanged", () => {
    expect(finiteOrNull(4200)).toBe(4200)
  })

  it("coerces a numeric string", () => {
    expect(finiteOrNull("9800")).toBe(9800)
  })

  it("preserves a present zero", () => {
    expect(finiteOrNull(0)).toBe(0)
  })

  it("returns null on an explicit null", () => {
    expect(finiteOrNull(null)).toBeNull()
  })

  it("returns null on an empty string", () => {
    expect(finiteOrNull("")).toBeNull()
  })

  it("returns null on undefined", () => {
    expect(finiteOrNull(undefined)).toBeNull()
  })

  it("returns null on a non-numeric string", () => {
    expect(finiteOrNull("abc")).toBeNull()
  })
})
