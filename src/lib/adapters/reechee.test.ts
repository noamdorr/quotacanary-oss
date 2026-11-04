import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("reechee")
const KEY = "rch_live_test"

afterEach(() => vi.restoreAllMocks())

// GET /api/v1/credit-balance, read from the Reechee source (not live-probed).
const REAL_RESPONSE = { data: { credits_balance: 1250 } }

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

describe("reechee adapter", () => {
  it("reads the credit balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.reechee.io/api/v1/credit-balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer rch_live_test" },
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
    stubFetch(401, { error: "unauthorized" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Reechee rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Reechee returned 429.",
    })
  })

  it("fails on a body without data.credits_balance", async () => {
    stubFetch(200, { data: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Reechee returned an unexpected response.",
    })
  })
})
