import { afterEach, describe, expect, it, vi } from "vitest"
import { wizaAdapter } from "./wiza"

afterEach(() => vi.restoreAllMocks())

describe("wiza adapter", () => {
  it("returns balance=api_credits and balanceLimit=null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ credits: { api_credits: 750 } }),
          }) as unknown as Response
      )
    )
    const result = await wizaAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "api",
          label: "API Credits",
          balance: 750,
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
    const result = await wizaAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Wiza rejected this key."
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
    const result = await wizaAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
