import { afterEach, describe, expect, it, vi } from "vitest"
import { scrapeopsAdapter } from "./scrapeops"
afterEach(() => vi.restoreAllMocks())
describe("scrapeops adapter", () => {
  it("derives balance from plan minus used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              plan_api_credits: 100000,
              used_api_credits: 40000,
            }),
          }) as unknown as Response
      )
    )
    const result = await scrapeopsAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 60000,
          balanceLimit: 100000,
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
    const result = await scrapeopsAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "ScrapeOps rejected this key."
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
    const result = await scrapeopsAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
