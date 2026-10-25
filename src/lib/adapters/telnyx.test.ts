import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("telnyx")
const KEY = "KEYtelnyx-token"

afterEach(() => vi.restoreAllMocks())

// Example GET /v2/balance response from the Telnyx API reference (Get user
// balance details). Every amount is a decimal string in data.currency.
const REAL_RESPONSE = {
  data: {
    record_type: "balance",
    pending: "10.00",
    balance: "300.00",
    credit_limit: "100.00",
    available_credit: "400.00",
    currency: "USD",
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

describe("telnyx adapter", () => {
  it("reads the account balance string as dollars with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telnyx.com/v2/balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer KEYtelnyx-token" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance (USD)",
          balance: 300,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(401, {
      errors: [
        {
          code: "10009",
          title: "Authentication failed",
          detail:
            "The API key looks malformed. Check that you copied it correctly.",
        },
      ],
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Telnyx rejected this key.",
    })
  })

  it("rejects the key on 403", async () => {
    // The docs' ForbiddenErrorResponse: a key without access to billing.
    stubFetch(403, {
      errors: [{ code: "10010", title: "Authorization failed" }],
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Telnyx rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Telnyx returned 429.",
    })
  })

  it("fails on a body without data.balance", async () => {
    stubFetch(200, { data: { record_type: "balance", currency: "USD" } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Telnyx returned an unexpected response.",
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
