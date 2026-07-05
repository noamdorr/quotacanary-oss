import { afterEach, describe, expect, it, vi } from "vitest"
import { proxycurlAdapter } from "./proxycurl"

afterEach(() => vi.restoreAllMocks())

describe("proxycurl adapter", () => {
  it("reads credit balance with bearer auth", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ credit_balance: 100000 }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await proxycurlAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://nubela.co/api/v1/meta/credit-balance",
      expect.objectContaining({ headers: { Authorization: "Bearer api-key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 100000,
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

    const result = await proxycurlAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Proxycurl rejected this key.",
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

    const result = await proxycurlAdapter.readBalance("api-key")

    expect(result.ok).toBe(false)
  })

  it("treats a missing credit_balance field as an unexpected response, not a zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({}),
          }) as unknown as Response
      )
    )

    const result = await proxycurlAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Proxycurl returned an unexpected response.",
    })
  })

  it("records a present zero credit_balance as a healthy zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ credit_balance: 0 }),
          }) as unknown as Response
      )
    )

    const result = await proxycurlAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 0,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })
})
