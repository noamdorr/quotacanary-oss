import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("linkup")
const KEY = "linkup-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/credits/balance response from the Linkup OpenAPI spec.
const REAL_RESPONSE = {
  balance: 123.456,
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

describe("linkup adapter", () => {
  it("reads the fractional credit balance with a Bearer key", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.linkup.so/v1/credits/balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer linkup-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 123.456,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-18; the spec lists 401 for a bad key.
    stubFetch(401, {
      error: {
        code: "UNAUTHORIZED",
        details: [],
        message: "Unauthorized action",
      },
      statusCode: 401,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Linkup rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Linkup returned 429.",
    })
  })

  it("fails on a body without balance", async () => {
    stubFetch(200, { credits: 123.456 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Linkup returned an unexpected response.",
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
