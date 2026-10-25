import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("hubspot")
const KEY = "pat-na1-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /account-info/2026-03/api-usage/daily/private-apps response from
// the HubSpot Account Information API guide (2026-03). It counts API calls
// made by legacy private apps today, not purchased HubSpot credits.
const REAL_RESPONSE = {
  results: [
    {
      name: "private-apps-api-calls-daily",
      usageLimit: 1000000,
      currentUsage: 2,
      collectedAt: "2025-12-12T22:25:10.655Z",
      fetchStatus: "SUCCESS",
      resetsAt: "2025-12-13T05:00:00Z",
    },
  ],
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

describe("hubspot adapter", () => {
  it("reads the daily API call quota with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hubapi.com/account-info/2026-03/api-usage/daily/private-apps",
      expect.objectContaining({
        headers: { Authorization: "Bearer pat-na1-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "api_calls",
          label: "Daily API calls",
          balance: 999998,
          balanceLimit: 1000000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy token on 2026-10-17 (message trimmed).
    stubFetch(401, {
      status: "error",
      message: "Authentication credentials not found.",
      correlationId: "01a14a00-be52-7a5f-97f7-371b668e43a3",
      category: "INVALID_AUTHENTICATION",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "HubSpot rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "HubSpot returned 429.",
    })
  })

  it("fails on an empty results array", async () => {
    stubFetch(200, { results: [] })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "HubSpot returned an unexpected response.",
    })
  })

  it("fails on a non-JSON body", async () => {
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
    expect((await adapter.readBalance(KEY)).ok).toBe(false)
  })
})
