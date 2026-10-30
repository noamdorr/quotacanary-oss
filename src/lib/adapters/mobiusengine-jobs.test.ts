import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("mobiusengine-jobs")
const KEY = "mobiusengine-jobs-key"

afterEach(() => vi.restoreAllMocks())

// GET /v1/usage, the docs example (jobs.arihaan.ai llms-full.txt, Usage)
// with the series trimmed. The limit is in tokens a day, reset at 00:00 UTC;
// today and month are request counts. Free to read.
const REAL_RESPONSE = {
  tokens_today: 18400,
  tokens_month: 212300,
  daily_token_limit: 500000,
  concurrent_limit: 5,
  today: 42,
  month: 318,
  day_resets_at: "2026-09-29T00:00:00+00:00",
  month_resets_at: "2026-10-01T00:00:00+00:00",
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

describe("mobiusengine-jobs adapter", () => {
  it("reads the balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://jobs-api.arihaan.ai/v1/usage",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer mobiusengine-jobs-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "daily_tokens",
          label: "Daily tokens",
          balance: 481600,
          balanceLimit: 500000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Arihaan Jobs rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      tokens_today: 18400,
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Arihaan Jobs returned an unexpected response.",
    })
  })
})
