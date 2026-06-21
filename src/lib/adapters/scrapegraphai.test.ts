import { afterEach, describe, expect, it, vi } from "vitest"
import { scrapegraphaiAdapter } from "./scrapegraphai"

afterEach(() => vi.restoreAllMocks())

describe("scrapegraphai adapter", () => {
  it("returns remaining credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            remaining: 750000,
            used: 287,
            plan: "Pro Plan",
            jobs: {
              crawl: { used: 0, limit: 50 },
              monitor: { used: 0, limit: 100 },
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await scrapegraphaiAdapter.readBalance("key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://v2-api.scrapegraphai.com/api/credits",
      { headers: { "SGAI-APIKEY": "key" } }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 750000,
          balanceLimit: null,
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
          ({
            ok: false,
            status: 401,
            json: async () => ({}),
          }) as unknown as Response
      )
    )

    const result = await scrapegraphaiAdapter.readBalance("key")

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "ScrapeGraphAI rejected this key."
    )
  })

  it("returns an error when ScrapeGraphAI cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )

    const result = await scrapegraphaiAdapter.readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach ScrapeGraphAI.",
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

    const result = await scrapegraphaiAdapter.readBalance("key")

    expect(result.ok).toBe(false)
  })
})
