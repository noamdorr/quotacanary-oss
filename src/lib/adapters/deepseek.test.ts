import { afterEach, describe, expect, it, vi } from "vitest"
import { deepseekAdapter } from "./deepseek"

afterEach(() => vi.restoreAllMocks())

describe("deepseek adapter", () => {
  it("returns balance from USD entry (total_balance string)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              is_available: true,
              balance_infos: [
                {
                  currency: "USD",
                  total_balance: "110.00",
                  granted_balance: "0.00",
                  topped_up_balance: "110.00",
                },
              ],
            }),
          }) as Response
      )
    )
    const result = await deepseekAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: 110,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("picks USD entry when multiple currencies are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              is_available: true,
              balance_infos: [
                {
                  currency: "CNY",
                  total_balance: "800.00",
                  granted_balance: "0.00",
                  topped_up_balance: "800.00",
                },
                {
                  currency: "USD",
                  total_balance: "110.00",
                  granted_balance: "0.00",
                  topped_up_balance: "110.00",
                },
              ],
            }),
          }) as Response
      )
    )
    const result = await deepseekAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: 110,
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
    const result = await deepseekAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "DeepSeek rejected this key."
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
    const result = await deepseekAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
