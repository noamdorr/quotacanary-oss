import { afterEach, describe, expect, it, vi } from "vitest"
import { zenserpAdapter } from "./zenserp"
afterEach(() => vi.restoreAllMocks())
describe("zenserp adapter", () => {
  it("returns balance from remaining_requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ remaining_requests: 900 }),
          }) as unknown as Response
      )
    )
    const result = await zenserpAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: 900,
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
    const result = await zenserpAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Zenserp rejected this key."
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
    const result = await zenserpAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
