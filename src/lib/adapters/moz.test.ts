import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("moz")
const KEY = "moz-key"

afterEach(() => vi.restoreAllMocks())

// The JSON-RPC envelope matches what api.moz.com answered on 2026-10-19 (id
// echoed, result or error beside jsonrpc). The quota field names come from a
// third-party mirror of the quota.lookup docs (moz.com's page is
// client-rendered). Values illustrative; confirm on the first live reading.
const REAL_RESPONSE = {
  id: "quotacanary-quota-lookup",
  jsonrpc: "2.0",
  result: {
    quota: {
      path: "api.limits.data.rows",
      allotted: 3000,
      used: 1240,
      reset: "2026-11-01T00:00:00Z",
    },
  },
}

const BODY =
  '{"jsonrpc":"2.0","id":"quotacanary-quota-lookup","method":"quota.lookup","params":{"data":{"path":"api.limits.data.rows"}}}'

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

describe("moz adapter", () => {
  it("posts the quota.lookup call and reads rows left from allotted minus used", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.moz.com/jsonrpc",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moz-token": "moz-key",
        },
        body: BODY,
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "rows",
          label: "Rows",
          balance: 1760,
          balanceLimit: 3000,
          unit: "credits",
        },
      ],
    })
  })

  it("sends a request id of at least 24 characters", () => {
    // Moz refuses a shorter id with 400 "Request ID must be at least 24
    // characters." (observed 2026-10-19).
    expect(JSON.parse(BODY).id.length).toBeGreaterThanOrEqual(24)
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, {
      id: "quotacanary-quota-lookup",
      jsonrpc: "2.0",
      error: {
        code: -32651,
        httpStatus: 401,
        data: {},
        message: "Missing or invalid authentication",
      },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Moz rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Moz returned 429.",
    })
  })

  it("fails on a body without a quota", async () => {
    stubFetch(200, { id: "quotacanary-quota-lookup", jsonrpc: "2.0" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Moz returned an unexpected response.",
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
