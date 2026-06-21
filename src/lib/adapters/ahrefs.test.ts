import { afterEach, describe, expect, it, vi } from "vitest"
import { ahrefsAdapter } from "./ahrefs"

afterEach(() => vi.restoreAllMocks())

describe("ahrefs adapter", () => {
  it("derives remaining workspace API units from limit minus usage", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            limits_and_usage: {
              subscription: "Lite, billed monthly",
              usage_reset_date: "2026-06-27T00:00:00Z",
              units_limit_workspace: 100000,
              units_usage_workspace: 30670,
              units_limit_api_key: null,
              units_usage_api_key: 0,
              api_key_expiration_date: "2027-06-16T08:48:20Z",
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await ahrefsAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.ahrefs.com/v3/subscription-info/limits-and-usage",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer api-key",
        },
      }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "units",
          label: "API Units",
          balance: 69330,
          balanceLimit: 100000,
          unit: "credits",
        },
      ],
    })
  })

  it("uses the API-key cap when it is lower than workspace remaining units", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              limits_and_usage: {
                units_limit_workspace: 100000,
                units_usage_workspace: 10000,
                units_limit_api_key: 50000,
                units_usage_api_key: 47000,
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await ahrefsAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "units",
          label: "API Units",
          balance: 3000,
          balanceLimit: 50000,
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

    const result = await ahrefsAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Ahrefs rejected this key.",
    })
  })

  it("returns vendor-level errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ error: "Invalid output parameter." }),
          }) as unknown as Response
      )
    )

    const result = await ahrefsAdapter.readBalance("api-key")

    expect(result).toEqual({ ok: false, error: "Invalid output parameter." })
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

    const result = await ahrefsAdapter.readBalance("api-key")

    expect(result.ok).toBe(false)
  })
})
