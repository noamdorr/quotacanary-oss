import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("litescrape")
const KEY = "litescrape-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/keys/status, the docs example verbatim (litescrape.com/docs/key-status).
// The call is free and works at zero balance. The full response also carries
// pricing and credit-expiry fields the docs do not list.
const REAL_RESPONSE = {
  remaining_calls: 10000,
  concurrency_limit: 25,
  status: "active",
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

describe("litescrape adapter", () => {
  it("reads the remaining calls with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.litescrape.com/api/keys/status",
      expect.objectContaining({
        headers: { Authorization: "Bearer litescrape-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "calls",
          label: "Calls",
          balance: 10000,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("reads a zero balance", async () => {
    stubFetch(200, { ...REAL_RESPONSE, remaining_calls: 0 })
    const result = await adapter.readBalance(KEY)
    expect(result.ok && result.balances[0].balance).toBe(0)
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, {
      error: "The API key is invalid.",
      error_code: "invalid_key",
      status_code: 401,
      retryable: false,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Litescrape rejected this key.",
    })
  })

  it("rejects a disabled key on 403", async () => {
    // The docs: disabled keys return 403 api_key_disabled.
    stubFetch(403, { error_code: "api_key_disabled" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Litescrape rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Litescrape returned 429.",
    })
  })

  it("fails on a body without remaining_calls", async () => {
    stubFetch(200, { concurrency_limit: 25, status: "active" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Litescrape returned an unexpected response.",
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
