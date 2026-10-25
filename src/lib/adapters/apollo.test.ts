import { afterEach, describe, expect, it, vi } from "vitest"
import { apolloAdapter } from "./apollo"

afterEach(() => vi.restoreAllMocks())

// Shaped after the example response in Apollo's own docs for
// POST /api/v1/usage_stats/credit_usage_stats.
function usageResponse(stats: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      credit_usage_stats: stats,
      current_credit_cycle: {
        start_date: "2026-08-01T00:00:00.000Z",
        end_date: "2026-09-01T00:00:00.000Z",
      },
    }),
  } as unknown as Response
}

describe("apollo adapter", () => {
  it("maps every credit type to a pool with remaining and limit", async () => {
    const fetchMock = vi.fn(async () =>
      usageResponse({
        lead_credit: { limit: 10000, consumed: 2500, left_over: 7500 },
        direct_dial_credit: { limit: 1000, consumed: 120, left_over: 880 },
        export_credit: { limit: 5000, consumed: 250, left_over: 4750 },
        ai_credit: { limit: 2000, consumed: 75, left_over: 1925 },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await apolloAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.apollo.io/api/v1/usage_stats/credit_usage_stats",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "x-api-key": "api-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "lead_credit",
          label: "Lead Credits",
          balance: 7500,
          balanceLimit: 10000,
          unit: "credits",
        },
        {
          creditType: "direct_dial_credit",
          label: "Direct Dial Credits",
          balance: 880,
          balanceLimit: 1000,
          unit: "credits",
        },
        {
          creditType: "export_credit",
          label: "Export Credits",
          balance: 4750,
          balanceLimit: 5000,
          unit: "credits",
        },
        {
          creditType: "ai_credit",
          label: "AI Credits",
          balance: 1925,
          balanceLimit: 2000,
          unit: "credits",
        },
      ],
    })
  })

  it("omits credit types the plan doesn't include", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        usageResponse({
          export_credit: { limit: 5000, consumed: 250, left_over: 4750 },
          conversation_credit: { limit: 0, consumed: 0, left_over: 0 },
          power_up_credit: { limit: 0, consumed: 0, left_over: 0 },
        })
      )
    )

    const result = await apolloAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "export_credit",
          label: "Export Credits",
          balance: 4750,
          balanceLimit: 5000,
          unit: "credits",
        },
      ],
    })
  })

  it("reports dialer talk time in minutes, not credits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        usageResponse({
          dialer: { limit: 500, consumed: 12, left_over: 488 },
        })
      )
    )

    const result = await apolloAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "dialer",
          label: "Dialer Minutes",
          balance: 488,
          balanceLimit: 500,
          unit: "minutes",
        },
      ],
    })
  })

  it("derives remaining from limit minus consumed when left_over is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        usageResponse({
          web_search_record_credit: { limit: 1000, consumed: 150 },
        })
      )
    )

    const result = await apolloAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "web_search_record_credit",
          label: "Web Search Record Credits",
          balance: 850,
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

    const result = await apolloAdapter.readBalance("api-key")

    expect(result).toEqual({ ok: false, error: "Apollo rejected this key." })
  })

  it("returns error on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 403,
            json: async () => ({}),
          }) as unknown as Response
      )
    )

    const result = await apolloAdapter.readBalance("api-key")

    expect(result).toEqual({ ok: false, error: "Apollo rejected this key." })
  })

  it("returns error on a non-JSON response", async () => {
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

    const result = await apolloAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Apollo returned an unexpected response.",
    })
  })

  it("returns error when no usable pool comes back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => usageResponse({}))
    )

    const result = await apolloAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Apollo returned an unexpected response.",
    })
  })
})
