import { afterEach, describe, expect, it, vi } from "vitest"
import { brightdataAdapter } from "./brightdata"

afterEach(() => vi.restoreAllMocks())

describe("brightdata adapter", () => {
  it("returns balance in usd", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ balance: 142.5, pending_costs: 3.2 }),
          }) as Response
      )
    )
    const result = await brightdataAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: 142.5,
          balanceLimit: null,
          unit: "usd",
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
    const result = await brightdataAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "Bright Data rejected this key.",
    })
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
    const result = await brightdataAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
