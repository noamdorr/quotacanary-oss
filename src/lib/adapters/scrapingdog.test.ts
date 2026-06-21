import { afterEach, describe, expect, it, vi } from "vitest"
import { scrapingdogAdapter } from "./scrapingdog"

afterEach(() => vi.restoreAllMocks())

describe("scrapingdog adapter", () => {
  it("computes remaining = requestLimit - requestUsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              requestLimit: 40000,
              requestUsed: 12000,
              pack: "Lite",
            }),
          }) as Response
      )
    )
    const result = await scrapingdogAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: 28000,
          balanceLimit: 40000,
          unit: "credits",
        },
      ],
    })
  })

  it("returns error on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: false, status: 401, json: async () => ({}) }) as Response
      )
    )
    const result = await scrapingdogAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "Scrapingdog rejected this key.",
    })
  })

  it("returns an error on a non-JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              throw new Error("not json")
            },
          }) as unknown as Response
      )
    )
    const result = await scrapingdogAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
