import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("fishaudio")
const KEY = "fishaudio-key"

afterEach(() => vi.restoreAllMocks())

// GET /wallet/self/api-credit, from the vendor OpenAPI (no example values).
// credit is a string; both engines coerce numeric strings. Open point: the
// unit is unstated; pricing is pay-as-you-go in USD, so it reads as USD.
const REAL_RESPONSE = {
  _id: "64f0c0ffee",
  user_id: "u_123",
  credit: "17.42",
  cumulative_top_up: "50.00",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-10-28T00:00:00Z",
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

describe("fishaudio adapter", () => {
  it("reads the balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fish.audio/wallet/self/api-credit",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer fishaudio-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "wallet",
          label: "API credit",
          balance: 17.42,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fish Audio rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      _id: "64f0c0ffee",
      user_id: "u_123",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fish Audio returned an unexpected response.",
    })
  })
})
