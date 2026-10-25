import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("search1api")
const KEY = "search1api-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /usage response from the Search1API docs (Credits and limits).
// `usage` is the credits REMAINING, despite the name.
const REAL_RESPONSE = {
  usage: 24980,
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

describe("search1api adapter", () => {
  it("reads the remaining credits from usage with a Bearer key", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.search1api.com/usage",
      expect.objectContaining({
        headers: { Authorization: "Bearer search1api-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 24980,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-18.
    stubFetch(401, {
      error: "Unauthorized: Invalid bearer credential",
      message: "Unauthorized: Invalid bearer credential",
      ok: false,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Search1API rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Search1API returned 429.",
    })
  })

  it("fails on a body without usage", async () => {
    stubFetch(200, { credits: 24980 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Search1API returned an unexpected response.",
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
