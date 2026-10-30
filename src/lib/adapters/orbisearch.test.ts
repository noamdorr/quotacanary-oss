import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("orbisearch")
const KEY = "orbisearch-key"

afterEach(() => vi.restoreAllMocks())

// GET /v1/credits, the shape from OrbiSearch's API reference (credits.md).
// Credits can be fractional. Unlimited plans read /v1/unlimited/usage
// instead, which this entry does not cover.
const REAL_RESPONSE = {
  credits: 4820.25,
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

describe("orbisearch adapter", () => {
  it("reads the balance with an X-API-Key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.orbisearch.com/v1/credits",
      expect.objectContaining({
        headers: {
          "X-API-Key": "orbisearch-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 4820.25,
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
      error: "OrbiSearch rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "OrbiSearch returned an unexpected response.",
    })
  })
})
