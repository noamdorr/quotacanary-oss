import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("olostep")
const KEY = "olostep-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /user/credits/info response from the Olostep API reference (Get
// credit info). credits is the total left across lots, so with a top-up it is
// above the plan's active_subscription.credits.
const REAL_RESPONSE = {
  credits: 12500,
  breakdown: [
    {
      purchase_kind: "Subscription",
      allocated_units: 10000,
      remaining_units: 8500,
      expiry_date: 1735689600,
    },
    {
      purchase_kind: "Top-up",
      allocated_units: 5000,
      remaining_units: 4000,
      expiry_date: 1743465600,
    },
  ],
  active_subscription: {
    id: "SUB_PRO",
    display_name: "Pro",
    credits: 10000,
    created_at: 1704067200,
  },
  allow_usage: true,
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

describe("olostep adapter", () => {
  it("reads the credits left with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.olostep.com/user/credits/info",
      expect.objectContaining({
        headers: { Authorization: "Bearer olostep-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 12500,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 402", async () => {
    // The docs list 402 as "Invalid API key"; observed with a dummy key on
    // 2026-10-17.
    stubFetch(402, {
      invalid_api_key: true,
      message: "Your API key is invalid.",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Olostep rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Olostep returned 429.",
    })
  })

  it("fails on a body without credits", async () => {
    stubFetch(200, { allow_usage: true, breakdown: [] })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Olostep returned an unexpected response.",
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
