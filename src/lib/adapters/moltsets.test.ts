import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("moltsets")
const KEY = "moltsets-key"

afterEach(() => vi.restoreAllMocks())

// POST /get_account, trimmed from the docs example ("without a phone token
// subscription") with a metered balance in place of the example's unlimited
// -1. Values illustrative; confirm on the first live reading.
function account(results: Record<string, unknown>) {
  return {
    results: {
      id: "Xc4mT8wa",
      name: "Northwind Labs",
      status: "active",
      plan: "subscription_27",
      phone_token_balance: 0,
      personal_email_available: true,
      api_key_count: 1,
      user_count: 2,
      created_at: "2026-10-05T11:32:39Z",
      ...results,
    },
    status: "ok",
    metadata: {},
  }
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

describe("moltsets adapter", () => {
  it("posts an empty body with a Bearer token and a User-Agent", async () => {
    const fetchMock = stubFetch(
      200,
      account({ token_balance: 4210, unlimited: false })
    )
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.moltsets.com/api/v1/tools/get_account",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "QuotaCanary",
          Authorization: "Bearer moltsets-key",
        },
        body: "{}",
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 4210,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("refuses to read the unlimited sentinel as a balance", async () => {
    // token_balance is -1 on an unlimited plan; read as-is it would page the
    // user as critically low on every poll.
    stubFetch(200, account({ token_balance: -1, unlimited: true }))
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "MoltSets returned an error.",
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, {
      error: { code: "unauthorized", message: "Invalid API key." },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "MoltSets rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {
      error: { code: "rate_limited", message: "Too many requests." },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "MoltSets returned 429.",
    })
  })

  it("fails on a body without token_balance", async () => {
    stubFetch(200, account({ unlimited: false }))
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "MoltSets returned an unexpected response.",
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
