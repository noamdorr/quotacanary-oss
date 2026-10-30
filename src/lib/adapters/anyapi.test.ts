import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("anyapi")
const KEY = "anyapi-key"

afterEach(() => vi.restoreAllMocks())

// GET /v1/balance on getanyapi.com (treg's anyapi, not anyapi.io), the
// schema from the vendor OpenAPI: one required number, the wallet in USD.
// Reading it is free.
const REAL_RESPONSE = {
  usd: 42.17,
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

describe("anyapi adapter", () => {
  it("reads the balance with an X-API-Key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.getanyapi.com/v1/balance",
      expect.objectContaining({
        headers: {
          "X-API-Key": "anyapi-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "wallet",
          label: "Wallet",
          balance: 42.17,
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
      error: "AnyAPI rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "AnyAPI returned an unexpected response.",
    })
  })
})
