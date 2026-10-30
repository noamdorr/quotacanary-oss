import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("reapi")
const KEY = "reapi-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/v1/balance, the docs example (reapi.ai/docs/api/balance).
// Integer credits, 1 credit = $0.001, shown as credits. Free to read.
const REAL_RESPONSE = {
  balance: 12500,
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

describe("reapi adapter", () => {
  it("reads the balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reapi.ai/api/v1/balance",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer reapi-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 12500,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "ReAPI rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "ReAPI returned an unexpected response.",
    })
  })
})
