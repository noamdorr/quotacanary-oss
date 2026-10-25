import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("openmart")
const KEY = "openmart-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/v2/credit-balance, the docs example. The same three fields come
// back on every plan.
const REAL_RESPONSE = {
  period_start: "2025-08-05T20:22:47Z",
  period_end: "2026-08-05T20:22:47Z",
  balance: 998931751,
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

describe("openmart adapter", () => {
  it("reads the team balance with a Bearer token", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openmart.ai/api/v2/credit-balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer openmart-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 998931751,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, { detail: "Invalid API Key" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Openmart rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Openmart returned 429.",
    })
  })

  it("fails on a body without balance", async () => {
    stubFetch(200, { period_start: "2025-08-05T20:22:47Z" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Openmart returned an unexpected response.",
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
