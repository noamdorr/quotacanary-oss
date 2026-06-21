import { afterEach, describe, expect, it, vi } from "vitest"
import { scrapingbeeAdapter } from "./scrapingbee"

afterEach(() => vi.restoreAllMocks())

describe("scrapingbee adapter", () => {
  it("computes remaining = max_api_credit - used_api_credit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              max_api_credit: 1000,
              used_api_credit: 150,
              max_concurrency: 5,
            }),
          }) as Response
      )
    )
    const result = await scrapingbeeAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "API Credits",
          balance: 850,
          balanceLimit: 1000,
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
    const result = await scrapingbeeAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "ScrapingBee rejected this key.",
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
    const result = await scrapingbeeAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
