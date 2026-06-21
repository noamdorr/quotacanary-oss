import { afterEach, describe, expect, it, vi } from "vitest"
import { valueserpAdapter } from "./valueserp"
afterEach(() => vi.restoreAllMocks())
describe("valueserp adapter", () => {
  it("returns monthly and top-up readings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              account_info: {
                monthly_credits_remaining: 900,
                monthly_credits_limit: 1000,
                topup_credits_remaining: 50,
              },
            }),
          }) as unknown as Response
      )
    )
    const result = await valueserpAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "monthly",
          label: "Monthly Credits",
          balance: 900,
          balanceLimit: 1000,
          unit: "credits",
        },
        {
          creditType: "topup",
          label: "Top-up Credits",
          balance: 50,
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
    const result = await valueserpAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "ValueSERP rejected this key."
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
    const result = await valueserpAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
