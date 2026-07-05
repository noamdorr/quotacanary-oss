import { afterEach, describe, expect, it, vi } from "vitest"
import { firecrawlAdapter } from "./firecrawl"

afterEach(() => vi.restoreAllMocks())

describe("firecrawl adapter", () => {
  it("returns remaining credits and plan credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              remainingCredits: 1000,
              planCredits: 500000,
              billingPeriodStart: "2025-01-01T00:00:00Z",
              billingPeriodEnd: "2025-01-31T23:59:59Z",
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await firecrawlAdapter.readBalance("key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.firecrawl.dev/v2/team/credit-usage",
      expect.objectContaining({ headers: { Authorization: "Bearer key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1000,
          balanceLimit: 500000,
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

    const result = await firecrawlAdapter.readBalance("key")

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Firecrawl rejected this key."
    )
  })

  it("returns error when Firecrawl reports failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ success: false }),
          }) as unknown as Response
      )
    )

    const result = await firecrawlAdapter.readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Firecrawl rejected the credit usage request.",
    })
  })

  it("returns error when Firecrawl cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )

    const result = await firecrawlAdapter.readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach Firecrawl.",
    })
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

    const result = await firecrawlAdapter.readBalance("key")

    expect(result.ok).toBe(false)
  })
})
