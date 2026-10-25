import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("scrapedo")
const KEY = "sd token"

afterEach(() => vi.restoreAllMocks())

// Example GET /info response from the Scrape.do docs (Usage Statistics). The
// endpoint allows 10 requests per minute.
const REAL_RESPONSE = {
  IsActive: true,
  ConcurrentRequest: 40,
  MaxMonthlyRequest: 3500000,
  RemainingConcurrentRequest: 15,
  RemainingMonthlyRequest: 2565023,
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

describe("scrapedo adapter", () => {
  it("reads the monthly requests left with the token query parameter", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.scrape.do/info?token=sd%20token",
      expect.anything()
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: 2565023,
          balanceLimit: 3500000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key when the body says IsActive false", async () => {
    // Observed with a dummy token on 2026-10-17: 200 with every count at 0.
    stubFetch(200, {
      IsActive: false,
      ConcurrentRequest: 0,
      MaxMonthlyRequest: 0,
      RemainingConcurrentRequest: 0,
      RemainingMonthlyRequest: 0,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Scrape.do rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Scrape.do returned 429.",
    })
  })

  it("fails on a body without RemainingMonthlyRequest", async () => {
    stubFetch(200, { IsActive: true, MaxMonthlyRequest: 3500000 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Scrape.do returned an unexpected response.",
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
