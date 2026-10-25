import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("crawl4ai")

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/billing/balance response (as captured in treg's catalog;
// the Crawl4AI docs page documents the route but prints no body). `credit` is
// a numeric string; `credit_mc` is the same figure in milli-credits.
const REAL_RESPONSE = {
  billing_email: "",
  credit: "1000.00",
  credit_mc: 1000000,
  free: "0.00",
  free_mc: 0,
  free_period: "2026-10",
  has_card: true,
  recharge: {},
  spend_cap_mc: 0,
  spend_month: "0.00",
  spend_month_mc: 0,
  tier: "starter",
  topups: 1,
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

describe("crawl4ai adapter", () => {
  it("reads the credit string as a number with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("sk_live_test")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crawl4ai.com/v1/billing/balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk_live_test" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1000,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("keeps fractional credits", async () => {
    stubFetch(200, { ...REAL_RESPONSE, credit: "12.50" })
    expect(await adapter.readBalance("sk_live_test")).toMatchObject({
      ok: true,
      balances: [{ balance: 12.5 }],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance("sk_live_test")).toEqual({
      ok: false,
      error: "Crawl4AI rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("sk_live_test")).toEqual({
      ok: false,
      error: "Crawl4AI returned 429.",
    })
  })

  it("fails on an empty credit string instead of reporting zero", async () => {
    stubFetch(200, { ...REAL_RESPONSE, credit: "" })
    expect(await adapter.readBalance("sk_live_test")).toEqual({
      ok: false,
      error: "Crawl4AI returned an unexpected response.",
    })
  })

  it("fails on a body without credit", async () => {
    stubFetch(200, { tier: "starter" })
    expect((await adapter.readBalance("sk_live_test")).ok).toBe(false)
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
    expect((await adapter.readBalance("sk_live_test")).ok).toBe(false)
  })
})
