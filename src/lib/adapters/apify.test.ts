import { afterEach, describe, expect, it, vi } from "vitest"
import { apifyAdapter } from "./apify"

afterEach(() => vi.restoreAllMocks())

describe("apify adapter", () => {
  it("computes remaining = maxMonthlyUsageUsd - monthlyUsageUsd", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              limits: { maxMonthlyUsageUsd: 300 },
              current: { monthlyUsageUsd: 43 },
            },
          }),
        }) as Response
    )
    vi.stubGlobal("fetch", fetchMock)
    const result = await apifyAdapter.readBalance("key")
    // Key rides in the Authorization header, never the URL query string.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.apify.com/v2/users/me/limits",
      expect.objectContaining({ headers: { Authorization: "Bearer key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "usage",
          label: "Monthly Usage Left",
          balance: 257,
          balanceLimit: 300,
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
          ({ ok: false, status: 401, json: async () => ({}) }) as Response
      )
    )
    const result = await apifyAdapter.readBalance("key")
    expect(result).toEqual({ ok: false, error: "Apify rejected this key." })
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
    const result = await apifyAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
