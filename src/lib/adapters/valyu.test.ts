import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("valyu")
const KEY = "valyu-key"

afterEach(() => vi.restoreAllMocks())

// GET /v1/account/balance shape from the vendor CLI (valyuAI/valyu-cli
// src/lib/account-client.ts, BalanceResponse). Values illustrative; confirm on
// the first live reading.
const REAL_RESPONSE = {
  credit_balance_usd: 42.5,
  payg_usage_usd: 7.5,
  signup_credits_remaining_usd: 0,
  credit_limit_usd: null,
  credit_limit_enabled: false,
  will_invoice: false,
  tier: "free",
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

describe("valyu adapter", () => {
  it("reads the USD credit balance with the x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.valyu.ai/v1/account/balance",
      expect.objectContaining({
        headers: { "x-api-key": "valyu-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance (USD)",
          balance: 42.5,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-18.
    stubFetch(401, {
      title: "Invalid API key",
      status: 401,
      code: "invalid_api_key",
      detail: "Invalid or inactive API key.",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Valyu rejected this key.",
    })
  })

  it("rejects the key on 403", async () => {
    // A key without the billing:read management scope (data keys lack it).
    stubFetch(403, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Valyu rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Valyu returned 429.",
    })
  })

  it("fails on a body without credit_balance_usd", async () => {
    stubFetch(200, { balance: 42.5 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Valyu returned an unexpected response.",
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
