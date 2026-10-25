import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("aviato")
const KEY = "aviato-key"

afterEach(() => vi.restoreAllMocks())

// GET /billing/balance shape from the vendor's API reference (both fields
// double; lastTopupBalance is the balance right after the latest purchase or
// auto top-up, and optional). Values illustrative; confirm on the first live
// reading.
const REAL_RESPONSE = { balance: 742.5, lastTopupBalance: 1000 }

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

describe("aviato adapter", () => {
  it("reads the balance against the last top-up with a Bearer token", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://data.api.aviato.co/billing/balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer aviato-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 742.5,
          balanceLimit: 1000,
          unit: "credits",
        },
      ],
    })
  })

  it("reads the balance without a limit when there was no top-up", async () => {
    stubFetch(200, { balance: 50 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 50,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19: a plain-text body.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 401,
            json: async () => {
              throw new Error("not json")
            },
          }) as unknown as Response
      )
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Aviato rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Aviato returned 429.",
    })
  })

  it("fails on a body without balance", async () => {
    stubFetch(200, { lastTopupBalance: 1000 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Aviato returned an unexpected response.",
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
