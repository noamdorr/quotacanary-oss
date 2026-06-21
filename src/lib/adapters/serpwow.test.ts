import { afterEach, describe, expect, it, vi } from "vitest"
import { serpwowAdapter } from "./serpwow"
afterEach(() => vi.restoreAllMocks())
describe("serpwow adapter", () => {
  it("returns balance and balanceLimit from account_info", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              account_info: { credits_remaining: 900, credits_limit: 1000 },
            }),
          }) as unknown as Response
      )
    )
    const result = await serpwowAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 900,
          balanceLimit: 1000,
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
    const result = await serpwowAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "SerpWow rejected this key."
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
    const result = await serpwowAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
