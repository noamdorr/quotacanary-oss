import { afterEach, describe, expect, it, vi } from "vitest"
import { dataforseoAdapter, encodeDataForSeoCredentials } from "./dataforseo"

afterEach(() => vi.restoreAllMocks())

describe("dataforseo adapter", () => {
  it("reads USD account balance with basic auth credentials", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            status_code: 20000,
            tasks: [
              {
                status_code: 20000,
                result: [
                  {
                    money: {
                      total: 100,
                      balance: 42.5,
                    },
                  },
                ],
              },
            ],
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await dataforseoAdapter.readBalance(
      encodeDataForSeoCredentials({
        login: "api-login",
        password: "api-password",
      })
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dataforseo.com/v3/appendix/user_data",
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            "api-login:api-password"
          ).toString("base64")}`,
        },
      }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Account Balance",
          balance: 42.5,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("returns an error when the credentials payload is missing a field", async () => {
    const result = await dataforseoAdapter.readBalance(
      JSON.stringify({ login: "api-login" })
    )

    expect(result).toEqual({
      ok: false,
      error: "DataForSEO needs an API login and API password.",
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

    const result = await dataforseoAdapter.readBalance(
      encodeDataForSeoCredentials({
        login: "api-login",
        password: "api-password",
      })
    )

    expect(result).toEqual({
      ok: false,
      error: "DataForSEO rejected these credentials.",
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

    const result = await dataforseoAdapter.readBalance(
      encodeDataForSeoCredentials({
        login: "api-login",
        password: "api-password",
      })
    )

    expect(result.ok).toBe(false)
  })
})
