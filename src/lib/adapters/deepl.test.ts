import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("deepl")
const KEY = "deepl-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /v2/usage response for a Pro account from the DeepL API
// reference (Usage and quota), trimmed to the account totals and one product.
// character_limit is 1000000000000 when no Cost Control limit is set.
const REAL_RESPONSE = {
  character_count: 5947223,
  character_limit: 1000000000000,
  products: [
    {
      product_type: "translate",
      billing_unit: "characters",
      api_key_unit_count: 636,
      account_unit_count: 5941580,
      api_key_character_count: 636,
      character_count: 5941580,
    },
  ],
  api_key_character_count: 636,
  api_key_character_limit: 1000000000000,
  start_time: "2025-05-13T09:18:42Z",
  end_time: "2025-06-13T09:18:42Z",
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

describe("deepl adapter", () => {
  it("reads characters against the limit with a DeepL-Auth-Key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepl.com/v2/usage",
      expect.objectContaining({
        headers: { Authorization: "DeepL-Auth-Key deepl-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "characters",
          label: "Characters",
          balance: 999994052777,
          balanceLimit: 1000000000000,
          unit: "credits",
        },
      ],
    })
  })

  it("reads a capped account from the docs' Free-plan example", async () => {
    stubFetch(200, { character_count: 180118, character_limit: 1250000 })
    const result = await adapter.readBalance(KEY)
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "characters",
          label: "Characters",
          balance: 1069882,
          balanceLimit: 1250000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 403", async () => {
    // Observed with a dummy key on 2026-10-17: DeepL answers a bad key with 403.
    stubFetch(403, {
      message:
        "Authentication failed, provided API key is invalid. You can find more info in our docs: https://developers.deepl.com/docs/getting-started/auth",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "DeepL rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "DeepL returned 429.",
    })
  })

  it("fails on a body without character_limit", async () => {
    stubFetch(200, { character_count: 5947223 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "DeepL returned an unexpected response.",
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
