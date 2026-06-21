import { afterEach, describe, expect, it, vi } from "vitest"
import { reoonAdapter } from "./reoon"
afterEach(() => vi.restoreAllMocks())
describe("reoon adapter", () => {
  it("returns instant and daily readings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              remaining_instant_credits: 900,
              remaining_daily_credits: 100,
            }),
          }) as unknown as Response
      )
    )
    const result = await reoonAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "instant",
          label: "Credits",
          balance: 900,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "daily",
          label: "Daily Credits",
          balance: 100,
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
          ({
            ok: false,
            status: 401,
            json: async () => ({}),
          }) as unknown as Response
      )
    )
    const result = await reoonAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Reoon rejected this key."
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
    const result = await reoonAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
