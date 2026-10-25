import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("iproyal")
const KEY = "iproyal-token"

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/me response from the IPRoyal residential API docs (User).
// available_traffic is in GB: the same docs give sub-user traffic in GB.
const REAL_RESPONSE = {
  available_traffic: 32.6,
  subusers_count: 13,
  residential_user_hash: "01H7YCG0R9GYY1YCPS2S4QA6WB",
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

describe("iproyal adapter", () => {
  it("reads the residential traffic left with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://resi-api.iproyal.com/v1/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer iproyal-token" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "traffic",
          label: "Residential traffic",
          balance: 32.6,
          balanceLimit: null,
          unit: "gb",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy token on 2026-10-17.
    stubFetch(401, {
      error: { code: "unauthorized", message: "Not authorized" },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "IPRoyal rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "IPRoyal returned 429.",
    })
  })

  it("fails on a body without available_traffic", async () => {
    stubFetch(200, { subusers_count: 13 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "IPRoyal returned an unexpected response.",
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
