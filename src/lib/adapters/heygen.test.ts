import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("heygen")

afterEach(() => vi.restoreAllMocks())

// GET /v3/users/me responses built from the HeyGen API reference (Users ->
// Get current user). The docs give the schema and per-field examples but no
// whole example body; exactly one of wallet / subscription / usage_based is
// populated, picked by billing_type, and the others are null.
const USER = {
  username: "acme",
  email: "ops@example.com",
  first_name: null,
  last_name: null,
}

const WALLET_RESPONSE = {
  data: {
    ...USER,
    billing_type: "wallet",
    wallet: {
      currency: "usd",
      remaining_balance: 125.5,
      auto_reload: { enabled: false, threshold_usd: null, amount_usd: null },
    },
    subscription: null,
    usage_based: null,
  },
}

const SUBSCRIPTION_RESPONSE = {
  data: {
    ...USER,
    billing_type: "subscription",
    wallet: null,
    subscription: {
      plan: "team",
      credits: {
        premium_credits: { remaining: 500, resets_at: "2024-05-01T00:00:00Z" },
        add_on_credits: null,
      },
    },
    usage_based: null,
  },
}

const USAGE_BASED_RESPONSE = {
  data: {
    ...USER,
    billing_type: "usage_based",
    wallet: null,
    subscription: null,
    usage_based: {
      spending_current_usd: 42.5,
      spending_cap_usd: 100,
      included_credits: 4444,
      remaining_credits: 4426.9,
    },
  },
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

describe("heygen adapter", () => {
  it("reads the wallet balance on a wallet account with the x-api-key header", async () => {
    const fetchMock = stubFetch(200, WALLET_RESPONSE)
    const result = await adapter.readBalance("hg_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.heygen.com/v3/users/me",
      expect.objectContaining({ headers: { "x-api-key": "hg_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "wallet",
          label: "Wallet",
          balance: 125.5,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("reads premium credits on a subscription account", async () => {
    stubFetch(200, SUBSCRIPTION_RESPONSE)
    expect(await adapter.readBalance("hg_key")).toEqual({
      ok: true,
      balances: [
        {
          creditType: "subscription",
          label: "Premium credits",
          balance: 500,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("reads spend left under the cap on a usage-based account", async () => {
    stubFetch(200, USAGE_BASED_RESPONSE)
    expect(await adapter.readBalance("hg_key")).toEqual({
      ok: true,
      balances: [
        {
          creditType: "usage_based",
          label: "Spending cap",
          balance: 57.5,
          balanceLimit: 100,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {
      error: {
        code: "unauthorized",
        message: "Invalid or expired API key. Verify your x-api-key header.",
        param: null,
        doc_url: null,
      },
    })
    expect(await adapter.readBalance("hg_key")).toEqual({
      ok: false,
      error: "HeyGen rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {
      error: {
        code: "rate_limit_exceeded",
        message: "Too many requests.",
        param: null,
        doc_url: null,
      },
    })
    expect(await adapter.readBalance("hg_key")).toEqual({
      ok: false,
      error: "HeyGen returned 429.",
    })
  })

  it("fails when no billing block is populated", async () => {
    stubFetch(200, {
      data: {
        ...USER,
        billing_type: null,
        wallet: null,
        subscription: null,
        usage_based: null,
      },
    })
    expect(await adapter.readBalance("hg_key")).toEqual({
      ok: false,
      error: "HeyGen returned an unexpected response.",
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
    expect((await adapter.readBalance("hg_key")).ok).toBe(false)
  })
})
