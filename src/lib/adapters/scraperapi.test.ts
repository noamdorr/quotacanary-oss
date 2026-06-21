import { afterEach, describe, expect, it, vi } from "vitest"
import { scraperapiAdapter } from "./scraperapi"

afterEach(() => vi.restoreAllMocks())

describe("scraperapi adapter", () => {
  it("computes remaining = requestLimit - requestCount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              concurrentRequests: 0,
              requestCount: 2000,
              failedRequestCount: 5,
              requestLimit: 100000,
            }),
          }) as Response
      )
    )
    const result = await scraperapiAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: 98000,
          balanceLimit: 100000,
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
    const result = await scraperapiAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "ScraperAPI rejected this key.",
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
    const result = await scraperapiAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
