import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("ipinfo")
const KEY = "ipinfo-token"

afterEach(() => vi.restoreAllMocks())

// Example GET /me response from the IPinfo community guide "Easy way to check
// allowance usage". A daily value of 2147483647 means no daily cap; only the
// monthly requests totals are read.
const REAL_RESPONSE = {
  token: "example",
  requests: { day: 100, month: 200, limit: 50000, remaining: 47000 },
  features: {
    core: { daily: 2147483647, monthly: 50000 },
    hostio: { daily: 2147483647, monthly: 1000, result_limit: 5 },
  },
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

describe("ipinfo adapter", () => {
  it("reads the requests left against the limit with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ipinfo.io/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer ipinfo-token" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: 47000,
          balanceLimit: 50000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 403", async () => {
    // Observed with a dummy token on 2026-10-17, as a header and as ?token=
    // alike (message trimmed).
    stubFetch(403, {
      status: 403,
      error: {
        title: "Unknown token",
        message: "Please ensure you've entered your token correctly.",
      },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "IPinfo rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    // The developer docs answer an exceeded plan limit with 429.
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "IPinfo returned 429.",
    })
  })

  it("fails on a body without requests.remaining", async () => {
    stubFetch(200, { token: "example", requests: { limit: 50000 } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "IPinfo returned an unexpected response.",
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
