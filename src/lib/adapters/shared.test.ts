import { afterEach, describe, expect, it, vi } from "vitest"
import { finiteOrNull, timedFetch, toFiniteNumber } from "./shared"

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

describe("timedFetch failure logging", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("logs the host and underlying cause, then rethrows", async () => {
    // Every adapter catches this throw and maps it to a generic
    // "Couldn't reach X." that renders in the UI, so the real cause
    // (timeout vs DNS vs reset) survives only here.
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const boom = new TypeError("fetch failed")
    // biome-ignore lint/suspicious/noExplicitAny: mirrors undici's error shape
    ;(boom as any).cause = { code: "ECONNRESET" }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw boom
      })
    )

    await expect(
      timedFetch("https://api.example.com/v1/balance?api_key=SECRET")
    ).rejects.toThrow("fetch failed")
    expect(logSpy).toHaveBeenCalledWith(
      "[fetch] api.example.com failed: ECONNRESET"
    )
  })

  it("logs the error name when there is no cause code, and never the URL", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError")
      })
    )

    await expect(
      timedFetch("https://api.example.com/v1/balance?api_key=SECRET")
    ).rejects.toThrow()
    const logged = logSpy.mock.calls.flat().join(" ")
    expect(logged).toContain("TimeoutError")
    // Some vendors carry the API key in query params - it must never log.
    expect(logged).not.toContain("SECRET")
    expect(logged).not.toContain("api_key")
  })

  it("passes a successful response through untouched", async () => {
    const res = new Response("ok")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res)
    )

    await expect(timedFetch("https://api.example.com/v1")).resolves.toBe(res)
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
