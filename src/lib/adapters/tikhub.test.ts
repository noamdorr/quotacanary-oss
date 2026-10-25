import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("tikhub")
const KEY = "tikhub-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/v1/tikhub/user/get_user_info, the docs example
// (docs.tikhub.io/186826050e0.md) with the email masked. The docs do not name
// the balance's unit; TikHub prices requests in USD, so it reads as USD.
// Confirm on the first live reading.
const REAL_RESPONSE = {
  code: 200,
  router: "/api/v1/tikhub/user/get_user_info",
  api_key_data: {
    api_key_name: "Develop Test",
    api_key_scopes: ["/api/v1/tikhub/user/"],
    created_at: "2024-05-22T06:07:12.495520",
    expires_at: null,
    api_key_status: 1,
  },
  user_data: {
    email: "user@example.com",
    balance: 100,
    free_credit: 100,
    email_verified: true,
    account_disabled: false,
    is_active: true,
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

describe("tikhub adapter", () => {
  it("reads the account balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tikhub.io/api/v1/tikhub/user/get_user_info",
      expect.objectContaining({
        headers: { Authorization: "Bearer tikhub-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance (USD)",
          balance: 100,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19 (trimmed).
    stubFetch(401, {
      detail: {
        code: 401,
        message: "Invalid API token, your submitted API token is tikhub-ke***.",
      },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TikHub rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TikHub returned 429.",
    })
  })

  it("fails on a body without user_data.balance", async () => {
    stubFetch(200, { ...REAL_RESPONSE, user_data: { email_verified: true } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TikHub returned an unexpected response.",
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
