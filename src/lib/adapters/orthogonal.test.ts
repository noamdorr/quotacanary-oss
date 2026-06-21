import { afterEach, describe, expect, it, vi } from "vitest"
import { orthogonalAdapter } from "./orthogonal"

afterEach(() => vi.restoreAllMocks())

describe("orthogonal adapter", () => {
  it("reads formatted USD credit balance with bearer auth", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ balance: "$5.00" }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await orthogonalAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.orthogonal.com/v1/credits/balance",
      { headers: { Authorization: "Bearer api-key" } }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Credit Balance",
          balance: 5,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("returns error on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 403,
            json: async () => ({}),
          }) as unknown as Response
      )
    )

    const result = await orthogonalAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Orthogonal rejected this key.",
    })
  })

  it("returns an error on an unparseable balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ balance: "nope" }),
          }) as unknown as Response
      )
    )

    const result = await orthogonalAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Orthogonal returned an unexpected response.",
    })
  })
})
