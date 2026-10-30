import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("influencersclub")
const KEY = "influencersclub-key"

afterEach(() => vi.restoreAllMocks())

// GET /public/v1/accounts/credits/, the shape from the vendor OpenAPI
// (docs.influencers.club, account_credits_usage_retrieve). credits_used is
// lifetime-to-date, not a period limit, so the pool is the balance alone.
const REAL_RESPONSE = {
  credits_available: 1250.5,
  credits_used: 3749.5,
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

describe("influencersclub adapter", () => {
  it("reads the balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-dashboard.influencers.club/public/v1/accounts/credits/",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer influencersclub-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1250.5,
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
      error: "Influencers Club rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      credits_used: 3749.5,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Influencers Club returned an unexpected response.",
    })
  })
})
