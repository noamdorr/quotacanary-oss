import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("runway")

afterEach(() => vi.restoreAllMocks())

// GET /v1/organization response built from the Runway API reference
// (Organization -> Get organization information); the docs give the schema
// (creditBalance, tier.maxMonthlyCreditSpend, tier.models, usage.models) but
// no example values, so the numbers are made up to that schema and the
// per-model objects are left empty.
const REAL_RESPONSE = {
  tier: {
    maxMonthlyCreditSpend: 100000,
    models: {},
  },
  creditBalance: 4250,
  usage: {
    models: {},
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

describe("runway adapter", () => {
  it("reads the credit balance with a Bearer header and the API version header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("key_abc")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dev.runwayml.com/v1/organization",
      expect.objectContaining({
        headers: {
          "X-Runway-Version": "2024-11-06",
          Authorization: "Bearer key_abc",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 4250,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(401, {
      error:
        "The provided API key in the Authorization header did not start with `key_`.",
      docUrl: "https://docs.dev.runwayml.com/api",
    })
    expect(await adapter.readBalance("key_abc")).toEqual({
      ok: false,
      error: "Runway rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("key_abc")).toEqual({
      ok: false,
      error: "Runway returned 429.",
    })
  })

  it("fails on a body without creditBalance", async () => {
    stubFetch(200, { tier: { maxMonthlyCreditSpend: 100000 } })
    expect(await adapter.readBalance("key_abc")).toEqual({
      ok: false,
      error: "Runway returned an unexpected response.",
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
    expect((await adapter.readBalance("key_abc")).ok).toBe(false)
  })
})
