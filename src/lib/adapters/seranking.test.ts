import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("seranking")

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/account/subscription response from the SE Ranking Data API
// docs (Account system -> Subscription).
const REAL_RESPONSE = {
  subscription_info: {
    status: "active",
    start_date: "2024-01-18 14:20:02",
    expiration_date: "2024-02-18 14:20:02",
    units_limit: 5000000,
    units_left: 4975033,
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

describe("seranking adapter", () => {
  it("reads units left and the units limit with a Token header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("se_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.seranking.com/v1/account/subscription",
      expect.objectContaining({ headers: { Authorization: "Token se_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "units",
          label: "API units",
          balance: 4975033,
          balanceLimit: 5000000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {
      error_description:
        "Authentication failed. Please ensure you have a valid, enabled API key.",
    })
    expect(await adapter.readBalance("se_key")).toEqual({
      ok: false,
      error: "SE Ranking rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("se_key")).toEqual({
      ok: false,
      error: "SE Ranking returned 429.",
    })
  })

  it("preserves a zero balance", async () => {
    stubFetch(200, {
      subscription_info: { units_limit: 5000000, units_left: 0 },
    })
    expect(await adapter.readBalance("se_key")).toMatchObject({
      ok: true,
      balances: [{ balance: 0, balanceLimit: 5000000 }],
    })
  })

  it("fails on a body without units_left", async () => {
    stubFetch(200, { subscription_info: { status: "active" } })
    expect(await adapter.readBalance("se_key")).toEqual({
      ok: false,
      error: "SE Ranking returned an unexpected response.",
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
    expect((await adapter.readBalance("se_key")).ok).toBe(false)
  })
})
