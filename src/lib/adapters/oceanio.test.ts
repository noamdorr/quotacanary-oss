import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("oceanio")

afterEach(() => vi.restoreAllMocks())

// Sanitized /v2/credits/balance response from the Ocean.io docs. Only the
// standard `credits` buckets are read: one-time and recurring are separate
// pools so the dashboard shows which one is draining. The email, phone and
// preview buckets and the daily request counter are not balances.
const REAL_RESPONSE = {
  credits: { oneTime: 30.0, recurrent: 300.0 },
  emailCredits: { oneTime: 100, recurrent: 100 },
  phoneCredits: { oneTime: 100, recurrent: 100 },
  previewCredits: { oneTime: 100, recurrent: 100 },
  dailyLimitRateLeft: 1000,
  dailyLimitRateSecondsToReset: 3600,
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

describe("oceanio adapter", () => {
  it("reads one-time and recurring credits as separate pools", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("oc_token")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.ocean.io/v2/credits/balance",
      expect.objectContaining({ headers: { "x-api-token": "oc_token" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "one_time",
          label: "One-time credits",
          balance: 30,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "recurrent",
          label: "Recurring credits",
          balance: 300,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 403, which is how Ocean.io answers a bad token", async () => {
    stubFetch(403, {
      detail: "Current API token is not registered in our database",
    })
    expect(await adapter.readBalance("oc_token")).toEqual({
      ok: false,
      error: "Ocean.io rejected this key.",
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance("oc_token")).toEqual({
      ok: false,
      error: "Ocean.io rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, { detail: "Too many requests" })
    expect(await adapter.readBalance("oc_token")).toEqual({
      ok: false,
      error: "Ocean.io returned 429.",
    })
  })

  it("fails when neither credit bucket is present", async () => {
    stubFetch(200, { dailyLimitRateLeft: 1000 })
    expect(await adapter.readBalance("oc_token")).toEqual({
      ok: false,
      error: "Ocean.io returned an unexpected response.",
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
    expect((await adapter.readBalance("oc_token")).ok).toBe(false)
  })
})
