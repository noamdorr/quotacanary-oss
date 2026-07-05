import { afterEach, describe, expect, it, vi } from "vitest"
import { scrapingbeeAdapter } from "./scrapingbee"

afterEach(() => vi.restoreAllMocks())

describe("scrapingbee adapter", () => {
  it("computes remaining = max_api_credit - used_api_credit", async () => {
    const fetchMock = vi.fn(
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
    vi.stubGlobal("fetch", fetchMock)
    const result = await scrapingbeeAdapter.readBalance("key")
    // Key rides in the Authorization header, never the URL query string.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.scrapingbee.com/api/v1/usage",
      expect.objectContaining({ headers: { Authorization: "Bearer key" } })
    )
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

  it("treats a missing max_api_credit field as an unexpected response, not a zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ used_api_credit: 150, max_concurrency: 5 }),
          }) as Response
      )
    )
    const result = await scrapingbeeAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "ScrapingBee returned an unexpected response.",
    })
  })

  it("records a present zero max_api_credit as a healthy zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ max_api_credit: 0, used_api_credit: 0 }),
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
          balance: 0,
          balanceLimit: 0,
          unit: "credits",
        },
      ],
    })
  })
})
