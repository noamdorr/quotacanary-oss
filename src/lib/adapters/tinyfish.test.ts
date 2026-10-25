import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("tinyfish")
const KEY = "tinyfish-key"

afterEach(() => vi.restoreAllMocks())

// GET /v1/wallet, the OpenAPI example values (docs.tinyfish.ai, Get wallet).
// The balance is a decimal string in USD; a negative value means the wallet
// is overdrawn. rates and pending_top_up trimmed.
const REAL_RESPONSE = {
  available_balance: "21.44",
  currency: "USD",
  as_of: "2026-08-10T18:04:11.220Z",
  auto_reload: { state: "on", threshold: "5.00", recharge_to: "25.00" },
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

describe("tinyfish adapter", () => {
  it("reads the wallet balance with an X-API-Key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://agent.tinyfish.ai/v1/wallet",
      expect.objectContaining({
        headers: { "X-API-Key": "tinyfish-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "wallet",
          label: "Wallet",
          balance: 21.44,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("reads an overdrawn wallet as a negative balance", async () => {
    stubFetch(200, { ...REAL_RESPONSE, available_balance: "-1.25" })
    const result = await adapter.readBalance(KEY)
    expect(result.ok && result.balances[0].balance).toBe(-1.25)
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, {
      error: { code: "INVALID_API_KEY", message: "Invalid or expired API key" },
      request_id: "63f2db46-cfee-4ad4-897a-95c9d9901f81",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TinyFish rejected this key.",
    })
  })

  it("shows the vendor's message when the account is not on wallet billing", async () => {
    // The docs: 404 FEATURE_NOT_AVAILABLE. Message text illustrative.
    stubFetch(404, {
      error: {
        code: "FEATURE_NOT_AVAILABLE",
        message: "This account is not assigned to wallet billing.",
      },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "This account is not assigned to wallet billing.",
    })
  })

  it("reports the status on a 429 without a message", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TinyFish returned 429.",
    })
  })

  it("fails on a body without available_balance", async () => {
    stubFetch(200, { currency: "USD" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TinyFish returned an unexpected response.",
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
