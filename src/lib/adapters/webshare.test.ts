import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { webshareAdapter as adapter } from "./webshare"

const KEY = "ws-key"
const HEADERS = { Authorization: `Token ${KEY}`, Accept: "application/json" }
const SUBSCRIPTION_URL = "https://proxy.webshare.io/api/v2/subscription/"
const PLAN_URL = "https://proxy.webshare.io/api/v2/subscription/plan/2/"
const NOW = "2026-10-17T12:00:00.000Z"
const aggregateUrl = (gte: string) =>
  `https://proxy.webshare.io/api/v2/stats/aggregate/?timestamp__gte=${gte}&timestamp__lte=${NOW}`

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Example responses from the API reference (apidocs.webshare.io, fetched
// 2026-10-17), trimmed to the fields the adapter reads plus a few neighbours.
// Subscription object: free_credits in USD, start_date/end_date bound the
// current 30-day term, plan is the active plan id.
const SUBSCRIPTION = {
  id: 1,
  plan: 2,
  payment_method: 1,
  free_credits: 13.37,
  term: "monthly",
  start_date: "2026-10-01T09:30:00.123456-07:00",
  end_date: "2026-10-31T09:30:00.123456-07:00",
  throttled: false,
}
const PERIOD_START = "2026-10-01T16:30:00.123Z"
// Plan object: bandwidth_limit is in GBs, 0 means unlimited.
const PLAN = {
  id: 2,
  status: "active",
  bandwidth_limit: 50.0,
  proxy_type: "shared",
  proxy_subtype: "default",
  proxy_count: 1000,
}
// Aggregate stats: bandwidth_total is in bytes (the stats object documents
// it that way; the aggregate example's 5000 is bytes too).
const AGGREGATE = {
  bandwidth_projected: 100000,
  bandwidth_total: 12_500_000_000,
  bandwidth_average: 1000,
  requests_total: 5,
}

const UNEXPECTED = {
  ok: false,
  error: "Webshare returned an unexpected response.",
}

type Step = { status: number; body: unknown } | "fail"

function stubFetch(...steps: Step[]) {
  const fetchMock = vi.fn()
  for (const step of steps) {
    if (step === "fail") {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
      continue
    }
    fetchMock.mockResolvedValueOnce({
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () =>
        typeof step.body === "string" ? JSON.parse(step.body) : step.body,
    } as unknown as Response)
  }
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function expectCalls(fetchMock: ReturnType<typeof vi.fn>, urls: string[]) {
  expect(fetchMock).toHaveBeenCalledTimes(urls.length)
  urls.forEach((url, i) => {
    expect(fetchMock).toHaveBeenNthCalledWith(
      i + 1,
      url,
      expect.objectContaining({ headers: HEADERS })
    )
  })
}

const traffic = (balance: number, limit: number) => ({
  creditType: "traffic",
  label: "Traffic",
  balance,
  balanceLimit: limit,
  unit: "gb",
})
const credits = (balance: number) => ({
  creditType: "free_credits",
  label: "Free credits",
  balance,
  balanceLimit: null,
  unit: "usd",
})

describe("Webshare adapter", () => {
  it("reads subscription, plan, then period usage: traffic and credits", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 200, body: PLAN },
      { status: 200, body: AGGREGATE }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [traffic(37.5, 50), credits(13.37)],
    })
    expectCalls(fetchMock, [
      SUBSCRIPTION_URL,
      PLAN_URL,
      aggregateUrl(PERIOD_START),
    ])
  })

  it("a capped plan with 0 free credits reports traffic only", async () => {
    stubFetch(
      { status: 200, body: { ...SUBSCRIPTION, free_credits: 0 } },
      { status: 200, body: PLAN },
      { status: 200, body: AGGREGATE }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [traffic(37.5, 50)],
    })
  })

  it("an unlimited plan reports credits only and skips the aggregate call", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 200, body: { ...PLAN, bandwidth_limit: 0 } }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [credits(13.37)],
    })
    expectCalls(fetchMock, [SUBSCRIPTION_URL, PLAN_URL])
  })

  it("an unlimited plan without credits has nothing to watch", async () => {
    stubFetch(
      { status: 200, body: { ...SUBSCRIPTION, free_credits: 0 } },
      { status: 200, body: { ...PLAN, bandwidth_limit: 0 } }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Webshare has no capped traffic or credits to watch.",
    })
  })

  it("usage over the cap floors the traffic balance at 0", async () => {
    stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 200, body: PLAN },
      { status: 200, body: { ...AGGREGATE, bandwidth_total: 51e9 } }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [traffic(0, 50), credits(13.37)],
    })
  })

  it("clamps a period start older than 90 days to now minus 90 days", async () => {
    const fetchMock = stubFetch(
      {
        status: 200,
        body: { ...SUBSCRIPTION, start_date: "2026-06-01T00:00:00Z" },
      },
      { status: 200, body: PLAN },
      { status: 200, body: AGGREGATE }
    )
    await adapter.readBalance(KEY)
    expect(fetchMock.mock.calls[2][0]).toBe(
      aggregateUrl("2026-07-19T12:00:00.000Z")
    )
  })

  it("maps 401 on the first call and 403 on a later one to a rejected key", async () => {
    // 401 body observed with a dummy key on 2026-10-17.
    let fetchMock = stubFetch({
      status: 401,
      body: { detail: "Invalid token." },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Webshare rejected this key.",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock = stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 403, body: {} }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Webshare rejected this key.",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("reports 429 and a 500 on the aggregate call by status", async () => {
    stubFetch({ status: 429, body: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Webshare returned 429.",
    })
    stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 200, body: PLAN },
      { status: 500, body: {} }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Webshare returned 500.",
    })
  })

  it("treats malformed bodies as unexpected, never as 0", async () => {
    stubFetch({ status: 200, body: "not json{" })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch({ status: 200, body: { ...SUBSCRIPTION, plan: null } })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch({ status: 200, body: { ...SUBSCRIPTION, free_credits: "lots" } })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 200, body: { ...PLAN, bandwidth_limit: null } }
    )
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch(
      { status: 200, body: { ...SUBSCRIPTION, start_date: "soon" } },
      { status: 200, body: PLAN }
    )
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 200, body: PLAN },
      { status: 200, body: { requests_total: 5 } }
    )
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("maps a network failure to an unreachable error", async () => {
    stubFetch("fail")
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach Webshare.",
    })
    stubFetch({ status: 200, body: SUBSCRIPTION }, "fail")
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach Webshare.",
    })
  })

  it("never echoes the key in an error", async () => {
    stubFetch({ status: 400, body: { detail: KEY } })
    const result = await adapter.readBalance(KEY)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })
})
