import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("getleads")
const KEY = "glb_live_getleads-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/v1/usage/fair-use (0 credits). Credit plans answer
// `applies: false` plus credits_remaining; the docs give no full example of
// that shape, so the values are illustrative. Confirm on the first live
// reading.
const CREDIT_PLAN_RESPONSE = {
  ok: true,
  applies: false,
  plan: "free",
  credits_remaining: 860,
}

// The docs example for an unlimited plan: fair-use windows, no credit count.
const UNLIMITED_RESPONSE = {
  ok: true,
  applies: true,
  plan: "unlimited",
  exempt: false,
  daily: {
    cap: 500000,
    used: 120000,
    remaining: 380000,
    period: "utc_calendar_day",
    period_start: "2026-08-21T00:00:00.000Z",
    resets_at: "2026-08-22T00:00:00.000Z",
  },
  monthly: {
    cap: 6000000,
    used: 800000,
    remaining: 5200000,
    period: "utc_calendar_month",
    period_start: "2026-08-01T00:00:00.000Z",
    resets_at: "2026-09-01T00:00:00.000Z",
  },
  binding: "daily",
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }) as unknown as Response
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("getleads adapter", () => {
  it("reads the remaining credits with the X-API-Key header", async () => {
    const fetchMock = stubFetch(200, CREDIT_PLAN_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.getleads.io/api/v1/usage/fair-use",
      expect.objectContaining({
        headers: { "X-API-Key": "glb_live_getleads-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 860,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("has no reading on an unlimited plan", async () => {
    // Known limit: unlimited plans have no credit balance to watch.
    stubFetch(200, UNLIMITED_RESPONSE)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "GetLeads returned an unexpected response.",
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, { ok: false, message: "Invalid API key." })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "GetLeads rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    // The one error body that does not use the {ok, message} shape.
    stubFetch(429, { error: "Too many requests" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "GetLeads returned 429.",
    })
  })

  it("fails on a non-JSON body", async () => {
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
    expect((await adapter.readBalance(KEY)).ok).toBe(false)
  })
})
