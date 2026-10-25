import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("fiberai")
const KEY = "fiberai-key"

afterEach(() => vi.restoreAllMocks())

// GET /v1/get-org-credits shape from the vendor's operation doc
// (api.fiber.ai/ai-docs/getOrgCredits.md): one output[] entry per
// subscription, numbers may be fractional. Values illustrative; confirm on the
// first live reading.
const REAL_RESPONSE = {
  output: [
    {
      organizationId: "org_123",
      subscriptionId: "sub_456",
      max: 10000,
      used: 2412.5,
      available: 7587.5,
      usagePeriodResetsOn: "2026-11-01T00:00:00.000Z",
      creditsPerOperation: null,
    },
  ],
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

describe("fiberai adapter", () => {
  it("reads the first subscription's credits with the x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fiber.ai/v1/get-org-credits",
      expect.objectContaining({
        headers: { "x-api-key": "fiberai-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 7587.5,
          balanceLimit: 10000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 403", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(403, { message: "Invalid API key provided!" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fiber AI rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fiber AI returned 429.",
    })
  })

  it("fails on an empty output array", async () => {
    stubFetch(200, { output: [] })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Fiber AI returned an unexpected response.",
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
