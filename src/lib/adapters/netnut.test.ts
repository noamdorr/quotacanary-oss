import { afterEach, describe, expect, it, vi } from "vitest"
import { netnutAdapter } from "./netnut"
afterEach(() => vi.restoreAllMocks())
describe("netnut adapter", () => {
  it("sums bandwidth across rows in gb", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              data: [{ plan_gb: 100, total_gb_used: 30 }],
            }),
          }) as unknown as Response
      )
    )
    const result = await netnutAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "bandwidth",
          label: "Bandwidth",
          balance: 70,
          balanceLimit: 100,
          unit: "gb",
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
    const result = await netnutAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "NetNut rejected this key."
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
    const result = await netnutAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
