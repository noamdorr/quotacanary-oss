import { afterEach, describe, expect, it, vi } from "vitest"
import { mangoolsAdapter as adapter } from "./mangools"

const KEY = "mangools-token"

afterEach(() => vi.restoreAllMocks())

// Trimmed from the Limit schema examples in the Mangools OpenAPI spec
// (https://api.mangools.com/v3/openapi.json, GET /kwfinder/limits).
const REAL_RESPONSE = {
  resources: {
    "related-keywords": { limit: 500, remaining: 497, reset: 7796 },
    serps: { limit: 500, remaining: 496, reset: 7769 },
    links: { limit: 100000, remaining: 99500, reset: 572091 },
    trends: { limit: 500, remaining: 499, reset: 8300 },
  },
  "reqs-per-short-period": 3,
  upgraded_account: true,
  highestPlan: "premium",
  platformPlan: "mangools",
}

// What /kwfinder/limits answered a dummy token on 2026-10-17 (trimmed): HTTP
// 200, every daily pool at 0 of 0, upgraded_account false. A free account
// with a real token also has upgraded_account false, so nothing in this body
// marks the key as bad.
const BAD_TOKEN_LIMITS = {
  resources: {
    "related-keywords": { limit: 0, remaining: 0 },
    serps: { limit: 0, remaining: 0 },
    links: { limit: 0, remaining: 0 },
    "share-of-search": { limit: 3, remaining: 0, reset: null },
  },
  upgraded_account: false,
  highestPlan: "free",
  platformPlan: "mangools",
}

type Reply = { status: number; body?: unknown }

// One reply per call, in order: /kwfinder/requests, then /kwfinder/limits.
function stubFetch(...replies: Reply[]) {
  const fetchMock = vi.fn()
  for (const { status, body } of replies) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response)
  }
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("mangools adapter", () => {
  it("checks the key, then reads three pools with an X-Access-Token header", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: [] },
      { status: 200, body: REAL_RESPONSE }
    )
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.mangools.com/v3/kwfinder/requests",
      expect.objectContaining({ headers: { "X-Access-Token": KEY } })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.mangools.com/v3/kwfinder/limits",
      expect.objectContaining({ headers: { "X-Access-Token": KEY } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "keyword_lookups",
          label: "Keyword lookups",
          balance: 497,
          balanceLimit: 500,
          unit: "credits",
        },
        {
          creditType: "serp_lookups",
          label: "SERP lookups",
          balance: 496,
          balanceLimit: 500,
          unit: "credits",
        },
        {
          creditType: "backlink_rows",
          label: "Backlink rows",
          balance: 99500,
          balanceLimit: 100000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects a bad token on the authenticated call and never reads limits", async () => {
    // Observed with a dummy token on 2026-10-17 on /kwfinder/requests.
    const fetchMock = stubFetch(
      {
        status: 401,
        body: { error: { type: "AuthError", message: "Invalid API Key" } },
      },
      { status: 200, body: BAD_TOKEN_LIMITS }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Mangools rejected this key.",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("never reads the bad-token 200 body as a real zero", async () => {
    // Defence in depth: even if the auth call passed, 0-of-0 pools are not
    // on the plan, so they are dropped rather than shown as dry.
    stubFetch(
      { status: 200, body: [] },
      { status: 200, body: BAD_TOKEN_LIMITS }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Mangools returned an unexpected response.",
    })
  })

  it("keeps a spent pool that is on the plan", async () => {
    stubFetch(
      { status: 200, body: [] },
      {
        status: 200,
        body: {
          resources: {
            "related-keywords": { limit: 100, remaining: 0, reset: 35000 },
          },
        },
      }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [
        {
          creditType: "keyword_lookups",
          label: "Keyword lookups",
          balance: 0,
          balanceLimit: 100,
          unit: "credits",
        },
      ],
    })
  })

  it("reports the status on 429", async () => {
    stubFetch({ status: 200, body: [] }, { status: 429, body: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Mangools returned 429.",
    })
  })

  it("reports the status when the auth call is rate limited", async () => {
    stubFetch({ status: 429 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Mangools returned 429.",
    })
  })

  it("fails on a body without resources", async () => {
    stubFetch(
      { status: 200, body: [] },
      { status: 200, body: { trackings: 1 } }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Mangools returned an unexpected response.",
    })
  })

  it("fails on a non-JSON body", async () => {
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json")
      },
    } as unknown as Response)
    vi.stubGlobal("fetch", fetchMock)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Mangools returned an unexpected response.",
    })
  })

  it("reports an unreachable host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach Mangools.",
    })
  })
})
