import { afterEach, describe, expect, it, vi } from "vitest"
import { serpapiAdapter } from "./serpapi"

afterEach(() => vi.restoreAllMocks())

describe("serpapi adapter", () => {
  it("returns total_searches_left as balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              total_searches_left: 1234,
              plan_searches_left: 1000,
              this_month_usage: 50,
            }),
          }) as Response
      )
    )
    const result = await serpapiAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "searches",
          label: "Searches Left",
          balance: 1234,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns error on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: false, status: 401, json: async () => ({}) }) as Response
      )
    )
    const result = await serpapiAdapter.readBalance("key")
    expect(result).toEqual({ ok: false, error: "SerpApi rejected this key." })
  })

  it("returns an error on a non-JSON body", async () => {
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
    const result = await serpapiAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })

  it("treats a missing total_searches_left field as an unexpected response, not a zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              plan_searches_left: 1000,
              this_month_usage: 50,
            }),
          }) as Response
      )
    )
    const result = await serpapiAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "SerpApi returned an unexpected response.",
    })
  })

  it("records a present zero total_searches_left as a healthy zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ total_searches_left: 0 }),
          }) as Response
      )
    )
    const result = await serpapiAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "searches",
          label: "Searches Left",
          balance: 0,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })
})
