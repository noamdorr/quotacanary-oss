import { afterEach, describe, expect, it, vi } from "vitest"
import { scrapflyAdapter } from "./scrapfly"
afterEach(() => vi.restoreAllMocks())
describe("scrapfly adapter", () => {
  it("returns balance and balanceLimit from subscription usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              subscription: {
                usage: { scrape: { remaining: 900, limit: 1000 } },
              },
            }),
          }) as unknown as Response
      )
    )
    const result = await scrapflyAdapter.readBalance("key")
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
    const result = await scrapflyAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Scrapfly rejected this key."
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
    const result = await scrapflyAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
