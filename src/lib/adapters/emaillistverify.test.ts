import { afterEach, describe, expect, it, vi } from "vitest"
import { emaillistverifyAdapter } from "./emaillistverify"
afterEach(() => vi.restoreAllMocks())
describe("emaillistverify adapter", () => {
  it("returns ondemand and subscription readings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              onDemand: { available: 500 },
              subscription: { available: 100 },
            }),
          }) as unknown as Response
      )
    )
    const result = await emaillistverifyAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "ondemand",
          label: "Credits",
          balance: 500,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "subscription",
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
    const result = await emaillistverifyAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "EmailListVerify rejected this key."
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
    const result = await emaillistverifyAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
