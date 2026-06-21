import { describe, expect, it } from "vitest"
import { formatBalance } from "./format"

describe("formatBalance", () => {
  it("formats credits as a plain localized number", () => {
    expect(formatBalance(12500, "credits")).toBe("12,500")
  })

  it("formats usd as currency", () => {
    expect(formatBalance(110, "usd")).toBe("$110.00")
    expect(formatBalance(4.2, "usd")).toBe("$4.20")
  })

  it("formats gb with a unit suffix", () => {
    expect(formatBalance(12.5, "gb")).toBe("12.5 GB")
  })

  it("falls back to a plain number for an unknown unit", () => {
    expect(formatBalance(900, "searches")).toBe("900")
  })
})
