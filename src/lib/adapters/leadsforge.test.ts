import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("leadsforge")
const KEY = "leadsforge-key"

afterEach(() => vi.restoreAllMocks())

// GET /public/v1/balance per the Leadsforge OpenAPI spec (CreditBalanceResponse);
// the spec gives field names and types only, so the values are illustrative.
const REAL_RESPONSE = {
  availableCredits: 1250,
  reservedCredits: 50,
  emailEnrichmentPrice: 1,
  linkedinEnrichmentPrice: 1,
  phoneNumberEnrichmentPrice: 10,
  companyFollowersPrice: 1,
  companyLookalikePrice: 1,
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

describe("leadsforge adapter", () => {
  it("reads the available credits with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.leadsforge.ai/public/v1/balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer leadsforge-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1250,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-18.
    stubFetch(401, { message: "invalid api key", code: "invalid_api_key" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Leadsforge rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Leadsforge returned 429.",
    })
  })

  it("fails on a body without availableCredits", async () => {
    stubFetch(200, { reservedCredits: 50 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Leadsforge returned an unexpected response.",
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
