import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("bounceban")

afterEach(() => vi.restoreAllMocks())

// Sanitized /v1/account response from the BounceBan docs. The key rides in
// a bare Authorization header: no Bearer prefix.
const REAL_RESPONSE = {
  owner_email: "dev@example.com",
  available_credits: 375215,
  rate_limit: [
    { api: "/verify/single", limit: "25 per second" },
    { api: "/account", limit: "5 per second" },
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

describe("bounceban adapter", () => {
  it("reads available credits with the raw key in Authorization", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("bb_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.bounceban.com/v1/account",
      expect.objectContaining({ headers: { Authorization: "bb_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 375215,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance("bb_key")).toEqual({
      ok: false,
      error: "BounceBan rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("bb_key")).toEqual({
      ok: false,
      error: "BounceBan returned 429.",
    })
  })

  it("fails on a body without available_credits", async () => {
    stubFetch(200, { owner_email: "dev@example.com" })
    expect(await adapter.readBalance("bb_key")).toEqual({
      ok: false,
      error: "BounceBan returned an unexpected response.",
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
    expect((await adapter.readBalance("bb_key")).ok).toBe(false)
  })
})
