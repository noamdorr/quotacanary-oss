import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("sumble")
const KEY = "sumble-key"

afterEach(() => vi.restoreAllMocks())

// POST /v9/technologies/find with a query that never matches: the docs say a
// request with no matches costs no credits, and credits_remaining is required
// on every response (api.sumble.com/openapi.json). Open point: if the probe
// can ever match, each poll costs a credit and Sumble becomes unsupported.
const REAL_RESPONSE = {
  id: "0b6f2f1e-1c1a-4c8e-9f3a-2d7f5e6a9b10",
  credits_used: 0,
  credits_remaining: 940,
  technologies: [],
  total_count: 0,
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

describe("sumble adapter", () => {
  it("posts a no-match probe with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sumble.com/v9/technologies/find",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sumble-key",
        },
        body: '{"query":"quotacanary-balance-check-zzqx"}',
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 940,
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
      error: "Sumble rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      id: "0b6f2f1e-1c1a-4c8e-9f3a-2d7f5e6a9b10",
      technologies: [],
      total_count: 0,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Sumble returned an unexpected response.",
    })
  })
})
