import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("eodhd")
const KEY = "eodhd-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/user, built from the docs' field list (eodhd.com/financial-apis/
// user-api; the example there is an image). Daily calls reset at 00:00 GMT;
// extraLimit is bought calls spent after the daily limit. Free to read.
const REAL_RESPONSE = {
  name: "Jane Doe",
  email: "user@example.com",
  subscriptionType: "monthly",
  paymentMethod: "Stripe",
  apiRequests: 3120,
  apiRequestsDate: "2026-10-28",
  dailyRateLimit: 100000,
  extraLimit: 500,
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }) as unknown as Response
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("eodhd adapter", () => {
  it("reads the balance with the key in the query", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://eodhd.com/api/user?fmt=json&api_token=eodhd-key",
      expect.anything()
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "daily",
          label: "Daily API calls",
          balance: 96880,
          balanceLimit: 100000,
          unit: "credits",
        },
        {
          creditType: "extra",
          label: "Extra API calls",
          balance: 500,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "EODHD rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      name: "Jane Doe",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "EODHD returned an unexpected response.",
    })
  })
})
