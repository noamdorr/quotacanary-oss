import { Buffer } from "node:buffer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeVerifaliaCredentials, verifaliaAdapter } from "./verifalia"

afterEach(() => vi.restoreAllMocks())

describe("verifalia adapter", () => {
  it("reads credit pack and free daily credit balances", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            creditPacks: 9633.516,
            freeCredits: 28.962,
            freeCreditsResetIn: "14:29:15",
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await verifaliaAdapter.readBalance(
      encodeVerifaliaCredentials({
        username: "api-user",
        password: "api-password",
      })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.verifalia.com/v2.7/credits/balance",
      {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from("api-user:api-password").toString(
            "base64"
          )}`,
        },
      }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credit_packs",
          label: "Credit Packs",
          balance: 9633.516,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "free_daily",
          label: "Free Daily Credits",
          balance: 28.962,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("allows plans without free daily credits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ creditPacks: 1500 }),
          }) as unknown as Response
      )
    )

    const result = await verifaliaAdapter.readBalance(
      encodeVerifaliaCredentials({
        username: "api-user",
        password: "api-password",
      })
    )

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credit_packs",
          label: "Credit Packs",
          balance: 1500,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns an error when the credential payload is missing a field", async () => {
    const result = await verifaliaAdapter.readBalance(
      JSON.stringify({ username: "api-user" })
    )

    expect(result).toEqual({
      ok: false,
      error: "Verifalia needs an API username and password.",
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

    const result = await verifaliaAdapter.readBalance(
      encodeVerifaliaCredentials({
        username: "api-user",
        password: "api-password",
      })
    )

    expect(result).toEqual({
      ok: false,
      error: "Verifalia rejected these credentials.",
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

    const result = await verifaliaAdapter.readBalance(
      encodeVerifaliaCredentials({
        username: "api-user",
        password: "api-password",
      })
    )

    expect(result.ok).toBe(false)
  })
})
