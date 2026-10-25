import { afterEach, describe, expect, it, vi } from "vitest"
import { majesticAdapter as adapter } from "./majestic"

afterEach(() => vi.restoreAllMocks())

// Trimmed from the GetSubscriptionInfo JSON example in the Majestic developer
// docs; the DataTables block is not read.
const REAL_RESPONSE = {
  Code: "OK",
  ErrorMessage: "",
  FullError: "",
  IndexBuildDate: "2017-09-04 13:42:54",
  SubscriptionIsActive: 1,
  TotalAnalysisResUnits: 97094051,
  TotalDetailedReportsPerPeriodRemaining: 1010,
  TotalIndexItemInfoResUnits: 504986,
  TotalRetrievalResUnits: 19462890,
  DataTables: { Subscriptions: { Headers: {}, Data: [] } },
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

describe("majestic adapter", () => {
  it("posts the key in a form body and reads the three unit totals", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("mj key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.majestic.com/api/json",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "app_api_key=mj+key&cmd=GetSubscriptionInfo",
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "analysis_units",
          label: "Analysis units",
          balance: 97094051,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "retrieval_units",
          label: "Retrieval units",
          balance: 19462890,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "index_item_info_units",
          label: "Index item info units",
          balance: 504986,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  // Body observed 2026-10-17 from api.majestic.com with a dummy key: HTTP 200,
  // and the message echoes the key, so it must never be passed through.
  it("rejects a bad key without echoing it", async () => {
    stubFetch(200, {
      Code: "FailedRequestViaAPI",
      ErrorMessage: "API Key does not appear to be correct: API_KEY - 'mj_key'",
      FullError: "",
    })
    const result = await adapter.readBalance("mj_key")
    expect(result).toEqual({ ok: false, error: "Majestic rejected this key." })
  })

  it("rejects the key on AuthenticationFailed", async () => {
    stubFetch(200, { Code: "AuthenticationFailed", ErrorMessage: "" })
    expect(await adapter.readBalance("mj_key")).toEqual({
      ok: false,
      error: "Majestic rejected this key.",
    })
  })

  it("names any other vendor code", async () => {
    stubFetch(200, { Code: "NoSubscription", ErrorMessage: "" })
    expect(await adapter.readBalance("mj_key")).toEqual({
      ok: false,
      error: "Majestic returned NoSubscription.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("mj_key")).toEqual({
      ok: false,
      error: "Majestic returned 429.",
    })
  })

  it("keeps the pools that are present and preserves a zero", async () => {
    stubFetch(200, { Code: "OK", TotalAnalysisResUnits: 0 })
    expect(await adapter.readBalance("mj_key")).toEqual({
      ok: true,
      balances: [
        {
          creditType: "analysis_units",
          label: "Analysis units",
          balance: 0,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("fails on an OK body without any unit totals", async () => {
    stubFetch(200, { Code: "OK", ErrorMessage: "" })
    expect(await adapter.readBalance("mj_key")).toEqual({
      ok: false,
      error: "Majestic returned an unexpected response.",
    })
  })

  it("fails on a body without a Code", async () => {
    stubFetch(200, { TotalAnalysisResUnits: 10 })
    expect(await adapter.readBalance("mj_key")).toEqual({
      ok: false,
      error: "Majestic returned an unexpected response.",
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
    expect(await adapter.readBalance("mj_key")).toEqual({
      ok: false,
      error: "Majestic returned an unexpected response.",
    })
  })
})
