import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("hasdata")
const KEY = "hasdata-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /user/me/usage response from the HasData docs (Credits &
// Concurrency).
const REAL_RESPONSE = {
  status: "ok",
  data: {
    totalCredits: 10000000,
    availableCredits: 5473702,
    concurrentRequests: 0,
    availableConcurrency: 100,
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

describe("hasdata adapter", () => {
  it("reads the credits left with the x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hasdata.com/user/me/usage",
      expect.objectContaining({
        headers: { "x-api-key": "hasdata-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 5473702,
          balanceLimit: 10000000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(401, { message: "Invalid api key" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "HasData rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "HasData returned 429.",
    })
  })

  it("fails on a body without data.availableCredits", async () => {
    stubFetch(200, { status: "ok", data: { totalCredits: 10000000 } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "HasData returned an unexpected response.",
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
