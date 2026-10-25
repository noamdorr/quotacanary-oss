import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("blitzapi")
const KEY = "blitz-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /v2/account/key-info response from the BlitzAPI docs (Get API key details).
const REAL_RESPONSE = {
  valid: true,
  id: "XXX",
  records_remaining: 950,
  next_reset_at: "2026-02-12T17:48:25.199Z",
  max_requests_per_seconds: 5,
  allowed_apis: [
    "/search/waterfall-icp-keyword",
    "/enrichment/linkedin-to-domain",
    "/enrichment/email",
  ],
  active_plans: [
    {
      name: "Startup Trial",
      status: "active",
      started_at: "2026-01-12T17:48:25.200Z",
    },
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

describe("blitzapi adapter", () => {
  it("reads the remaining records with the x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.blitz-api.ai/v2/account/key-info",
      expect.objectContaining({
        headers: { "x-api-key": "blitz-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Records",
          balance: 950,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Docs example, and observed with a dummy key on 2026-10-18.
    stubFetch(401, {
      success: false,
      message:
        "Invalid API key, please provide a valid API key in the 'x-api-key' header",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "BlitzAPI rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "BlitzAPI returned 429.",
    })
  })

  it("fails on a body without records_remaining", async () => {
    stubFetch(200, { valid: true, records: 950 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "BlitzAPI returned an unexpected response.",
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
