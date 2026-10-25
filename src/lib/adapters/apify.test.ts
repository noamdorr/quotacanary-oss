import { afterEach, describe, expect, it, vi } from "vitest"
import { formatBalance } from "../format"
import { apifyAdapter as adapter } from "./apify"

afterEach(() => vi.restoreAllMocks())

// Trimmed from the examples in Apify's API reference: GET /v2/users/me
// (https://docs.apify.com/api/v2/users-me-get) carries the plan's included
// monthly credit, GET /v2/users/me/limits
// (https://docs.apify.com/api/v2/users-me-limits-get) the usage this cycle.
// limits.maxMonthlyUsageUsd is the spending cap, never the limit (QUO-282).
const me = (monthlyUsageCreditsUsd: unknown) => ({
  data: { id: "u1", plan: { id: "STARTER", monthlyUsageCreditsUsd } },
})
const limits = (monthlyUsageUsd: unknown) => ({
  data: {
    monthlyUsageCycle: {
      startAt: "2026-10-14T00:00:00.000Z",
      endAt: "2026-11-13T23:59:59.999Z",
    },
    limits: { maxMonthlyUsageUsd: 500 },
    current: { monthlyUsageUsd },
  },
})

type Reply = { status: number; body?: unknown }

// One reply per call, in order: /v2/users/me, then /v2/users/me/limits.
function stubFetch(...replies: Reply[]) {
  const fetchMock = vi.fn()
  for (const { status, body } of replies) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response)
  }
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const pool = (balance: number, balanceLimit: number | null) => ({
  ok: true,
  balances: [
    {
      creditType: "usage",
      label: "Monthly Usage Left",
      balance,
      balanceLimit,
      unit: "usd",
    },
  ],
})

describe("apify adapter", () => {
  it("reads the plan's included credit as the limit, not the spending cap", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: me(49) },
      { status: 200, body: limits(12.5) }
    )
    expect(await adapter.readBalance("key")).toEqual(pool(36.5, 49))
    // Key rides in the Authorization header, never the URL query string.
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.apify.com/v2/users/me",
      expect.objectContaining({ headers: { Authorization: "Bearer key" } })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.apify.com/v2/users/me/limits",
      expect.objectContaining({ headers: { Authorization: "Bearer key" } })
    )
  })

  it("keeps a tiny usage from reading as a confusing zero", async () => {
    stubFetch(
      { status: 200, body: me(5) },
      { status: 200, body: limits(0.0003) }
    )
    const result = await adapter.readBalance("key")
    expect(result).toEqual(pool(4.9997, 5))
    if (!result.ok) throw new Error("expected a reading")
    expect(formatBalance(result.balances[0].balance, "usd")).toBe("$5.00")
  })

  it("shows 0 left, never a negative balance, once usage passes the included credit", async () => {
    stubFetch({ status: 200, body: me(49) }, { status: 200, body: limits(60) })
    expect(await adapter.readBalance("key")).toEqual(pool(0, 49))
  })

  it("treats missing usage as nothing used yet", async () => {
    stubFetch(
      { status: 200, body: me(49) },
      { status: 200, body: { data: { current: {} } } }
    )
    expect(await adapter.readBalance("key")).toEqual(pool(49, 49))
  })

  it("errors when the plan has no included credit figure", async () => {
    stubFetch({ status: 200, body: me(null) }, { status: 200, body: limits(1) })
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Apify returned an unexpected response.",
    })
  })

  it("returns error on 401 without asking for the usage", async () => {
    const fetchMock = stubFetch({ status: 401, body: {} })
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Apify rejected this key.",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reports a failed usage request by its status", async () => {
    stubFetch({ status: 200, body: me(49) }, { status: 500, body: {} })
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Apify returned 500.",
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
    const result = await adapter.readBalance("key")
    expect(result.ok).toBe(false)
  })

  it("returns an error when Apify cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Couldn't reach Apify.",
    })
  })
})
