import { afterEach, describe, expect, it, vi } from "vitest"
import { outscraperAdapter } from "./outscraper"

afterEach(() => vi.restoreAllMocks())

describe("outscraper adapter", () => {
  it("reads USD account balance with an API key header", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            balance: 1905.01,
            account_status: "valid",
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await outscraperAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.outscraper.com/profile/balance",
      expect.objectContaining({ headers: { "X-API-KEY": "api-key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Account Balance",
          balance: 1905.01,
          balanceLimit: null,
          unit: "usd",
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

    const result = await outscraperAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Outscraper rejected this key.",
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

    const result = await outscraperAdapter.readBalance("api-key")

    expect(result.ok).toBe(false)
  })
})
