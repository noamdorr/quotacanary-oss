import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeTombaCredentials, tombaAdapter } from "./tomba"

afterEach(() => vi.restoreAllMocks())

describe("tomba adapter", () => {
  it("reads available credit pools with Tomba key and secret headers", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              requests: {
                domains: { available: 420, used: 80 },
                verifications: { available: 900, used: 100 },
                phones: { available: 45, used: 5 },
                b2b: { available: 250, used: 50 },
              },
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await tombaAdapter.readBalance(
      encodeTombaCredentials({
        key: "ta_key",
        secret: "ts_secret",
      })
    )

    expect(fetchMock).toHaveBeenCalledWith("https://api.tomba.io/v1/me", {
      headers: {
        "X-Tomba-Key": "ta_key",
        "X-Tomba-Secret": "ts_secret",
      },
    })
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "searches",
          label: "Searches",
          balance: 420,
          balanceLimit: 500,
          unit: "credits",
        },
        {
          creditType: "verifications",
          label: "Verifications",
          balance: 900,
          balanceLimit: 1000,
          unit: "credits",
        },
        {
          creditType: "phones",
          label: "Phones",
          balance: 45,
          balanceLimit: 50,
          unit: "credits",
        },
        {
          creditType: "b2b",
          label: "B2B",
          balance: 250,
          balanceLimit: 300,
          unit: "credits",
        },
      ],
    })
  })

  it("returns an error when the credential payload is missing a field", async () => {
    const result = await tombaAdapter.readBalance(
      JSON.stringify({ key: "ta_key" })
    )

    expect(result).toEqual({
      ok: false,
      error: "Tomba needs an API key and API secret.",
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

    const result = await tombaAdapter.readBalance(
      encodeTombaCredentials({
        key: "ta_key",
        secret: "ts_secret",
      })
    )

    expect(result).toEqual({
      ok: false,
      error: "Tomba rejected these credentials.",
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

    const result = await tombaAdapter.readBalance(
      encodeTombaCredentials({
        key: "ta_key",
        secret: "ts_secret",
      })
    )

    expect(result.ok).toBe(false)
  })
})
