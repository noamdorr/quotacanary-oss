import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("crustdata")
const KEY = "crust-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /account/credits response from the Crustdata API reference
// (Account APIs, standard_account). credits includes top-ups that roll over,
// so it can exceed recurring_credits and is read as a bare balance.
const REAL_RESPONSE = {
  account: {
    credits: 3915552.99,
    recurring_credits: 1000000,
    recurring_credits_frequency: "monthly",
    recurring_credits_refresh_date: "2026-08-06T00:00:00+00:00",
  },
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

describe("crustdata adapter", () => {
  it("reads fractional credits with a Bearer header and the API version header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crustdata.com/account/credits",
      expect.objectContaining({
        headers: {
          "x-api-version": "2025-11-01",
          Authorization: "Bearer crust-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 3915552.99,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Docs example, and observed with a dummy key on 2026-10-17.
    stubFetch(401, { message: "Invalid API key in request" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Crustdata rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Crustdata returned 429.",
    })
  })

  it("fails on a body without account.credits", async () => {
    stubFetch(200, { credits: 3915552.99 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Crustdata returned an unexpected response.",
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
