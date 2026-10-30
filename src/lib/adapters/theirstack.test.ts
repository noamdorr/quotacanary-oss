import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("theirstack")
const KEY = "theirstack-key"

afterEach(() => vi.restoreAllMocks())

// GET /v0/billing/credit-balance, from the vendor schema (no example values).
// api_credits is documented as "available to the team" and read as the
// remaining balance. Open point: if a live read shows it is the cycle total,
// this becomes limit api_credits minus used_api_credits.
const REAL_RESPONSE = {
  ui_credits: 50,
  used_ui_credits: 10,
  api_credits: 1800,
  used_api_credits: 200,
  earliest_expiration: "2026-12-01T00:00:00Z",
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

describe("theirstack adapter", () => {
  it("reads the balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.theirstack.com/v0/billing/credit-balance",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer theirstack-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "api_credits",
          label: "API credits",
          balance: 1800,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TheirStack rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      ui_credits: 50,
      used_ui_credits: 10,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "TheirStack returned an unexpected response.",
    })
  })
})
