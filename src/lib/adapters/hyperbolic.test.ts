import { afterEach, describe, expect, it, vi } from "vitest"
import { hyperbolicAdapter } from "./hyperbolic"

afterEach(() => vi.restoreAllMocks())

describe("hyperbolic adapter", () => {
  it("converts credits (cents) to dollars (credits 1000 → balance 10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ credits: 1000 }),
          }) as Response
      )
    )
    const result = await hyperbolicAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: 10,
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
    const result = await hyperbolicAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Hyperbolic rejected this key."
    )
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
    const result = await hyperbolicAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
