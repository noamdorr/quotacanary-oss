import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("fetchin")
const KEY = "fetchin-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/v1/subscription, the docs example. creditsRemaining is the plan
// allowance plus pay-as-you-go credits, so it can exceed creditsLimit (here
// 684,230 against 250,000); the entry reads it without a limit.
const REAL_RESPONSE = {
  plan: "custom",
  active: true,
  status: "active",
  creditsRemaining: 684230,
  subscriptionCreditsRemaining: 184230,
  paygCreditsRemaining: 500000,
  paygExpiresAt: "2027-03-02T00:00:00.000Z",
  creditsLimit: 250000,
  creditsUsed: 65770,
  renewalDate: "2026-07-15T00:00:00.000Z",
  rpsLimit: 20,
  cancelAtPeriodEnd: false,
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

describe("fetchin adapter", () => {
  it("reads everything left to spend with the X-API-Key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fetchin.io/api/v1/subscription",
      expect.objectContaining({
        headers: { "X-API-Key": "fetchin-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 684230,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, {
      error: "Invalid API key",
      code: "INVALID_API_KEY",
      message: "Invalid API key",
      statusCode: 401,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fetchin rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    // This route allows 1 request per second on its own.
    stubFetch(429, { error: "Rate limited", code: "RATE_LIMITED" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fetchin returned 429.",
    })
  })

  it("fails on a body without creditsRemaining", async () => {
    stubFetch(200, { plan: "free", creditsLimit: 250000 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fetchin returned an unexpected response.",
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
