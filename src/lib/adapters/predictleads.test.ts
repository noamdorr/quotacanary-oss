import { afterEach, describe, expect, it, vi } from "vitest"
import {
  encodePredictLeadsCredentials,
  predictleadsAdapter,
} from "./predictleads"
import { getAdapter } from "./registry"

afterEach(() => vi.restoreAllMocks())

const credentials = encodePredictLeadsCredentials({
  apiKey: "pl_key",
  apiToken: "pl_token",
})

// Sanitized GET /api/v3/api_subscription response from the PredictLeads docs.
const REAL_RESPONSE = {
  data: [
    {
      id: "ea20b0c1-3427-4004-91e6-59a27be0c9ed",
      type: "api_subscription",
      attributes: {
        status: "active",
        monthly_credits_quota: 100,
        monthly_credits_used: 42,
      },
    },
  ],
  included: [],
  meta: { schema_version: "3.0" },
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

describe("predictleads adapter", () => {
  it("is registered as a hand-written adapter", () => {
    expect(getAdapter("predictleads")?.toolId).toBe("predictleads")
  })

  it("reads monthly quota minus used with both auth headers", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await predictleadsAdapter.readBalance(credentials)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://predictleads.com/api/v3/api_subscription",
      expect.objectContaining({
        headers: { "X-Api-Key": "pl_key", "X-Api-Token": "pl_token" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Monthly credits",
          balance: 58,
          balanceLimit: 100,
          unit: "credits",
        },
      ],
    })
  })

  it("fails before fetching when a credential field is missing", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(
      await predictleadsAdapter.readBalance(
        JSON.stringify({ apiKey: "pl_key" })
      )
    ).toEqual({
      ok: false,
      error: "PredictLeads needs an API key and API token.",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([401, 403])("rejects the credentials on %s", async (status) => {
    stubFetch(status, {})
    expect(await predictleadsAdapter.readBalance(credentials)).toEqual({
      ok: false,
      error: "PredictLeads rejected these credentials.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await predictleadsAdapter.readBalance(credentials)).toEqual({
      ok: false,
      error: "PredictLeads returned 429.",
    })
  })

  it("fails when the quota is missing instead of reporting zero", async () => {
    stubFetch(200, { data: [{ attributes: { status: "disabled" } }] })
    expect(await predictleadsAdapter.readBalance(credentials)).toEqual({
      ok: false,
      error: "PredictLeads returned an unexpected response.",
    })
  })

  it("fails on an empty data array", async () => {
    stubFetch(200, { data: [] })
    expect((await predictleadsAdapter.readBalance(credentials)).ok).toBe(false)
  })

  it("treats a missing used count as zero", async () => {
    stubFetch(200, { data: [{ attributes: { monthly_credits_quota: 100 } }] })
    expect(await predictleadsAdapter.readBalance(credentials)).toMatchObject({
      ok: true,
      balances: [{ balance: 100, balanceLimit: 100 }],
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
    expect((await predictleadsAdapter.readBalance(credentials)).ok).toBe(false)
  })

  it("handles a network failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await predictleadsAdapter.readBalance(credentials)).toEqual({
      ok: false,
      error: "Couldn't reach PredictLeads.",
    })
  })
})
