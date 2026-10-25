import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("contextdev")
const KEY = "contextdev-key"

afterEach(() => vi.restoreAllMocks())

// GET /org/usage, the OpenAPI example (key_metadata omitted). period is null
// when the org has no monthly credits or billing is paused.
const REAL_RESPONSE = {
  credits_remaining: 41250,
  period: { start: "2026-09-14T07:01:00.000Z", credits_used: 8750 },
  next_refill: { at: "2026-10-14T07:01:00.000Z", credits: 50000 },
  auto_topup: {
    enabled: false,
    credits_used_this_period: 0,
    monthly_budget_credits: 100000,
  },
  request_id: "3388a55e-9ba9-4cdb-a98b-ff82d2e5b4e8",
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

describe("contextdev adapter", () => {
  it("reads credits remaining against the period's usage with a Bearer token", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.context.dev/v1/org/usage",
      expect.objectContaining({
        headers: { Authorization: "Bearer contextdev-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 41250,
          balanceLimit: 50000,
          unit: "credits",
        },
      ],
    })
  })

  it("reads the balance without a limit when there is no monthly period", async () => {
    stubFetch(200, { ...REAL_RESPONSE, period: null, next_refill: null })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 41250,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, {
      message:
        "API key not found, are you sure you have the correct API key? Please check your API key on https://context.dev or contact hello@context.dev if the error persists.",
      error_code: "NOT_FOUND",
      request_id: "3388a55e-9ba9-4cdb-a98b-ff82d2e5b4e8",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Context.dev rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Context.dev returned 429.",
    })
  })

  it("fails on a body without credits_remaining", async () => {
    stubFetch(200, { period: REAL_RESPONSE.period })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Context.dev returned an unexpected response.",
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
