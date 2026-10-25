import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("enrichlayer")
const KEY = "el-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /api/v2/credit-balance response from the Enrich Layer OpenAPI
// spec (Meta API, View Credit Balance Endpoint; costs 0 credits).
const REAL_RESPONSE = {
  credit_balance: 100000,
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

describe("enrichlayer adapter", () => {
  it("reads the credit balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://enrichlayer.com/api/v2/credit-balance",
      expect.objectContaining({ headers: { Authorization: "Bearer el-key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 100000,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(401, {
      code: 401,
      description: "Invalid API key",
      name: "Unauthorized",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Enrich Layer rejected this key.",
    })
  })

  it("reports 403 as a status, since the docs define it as out of credits", async () => {
    stubFetch(403, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Enrich Layer returned 403.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Enrich Layer returned 429.",
    })
  })

  it("fails on a body without credit_balance", async () => {
    stubFetch(200, { balance: 100000 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Enrich Layer returned an unexpected response.",
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
