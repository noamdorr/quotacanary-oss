import { afterEach, describe, expect, it, vi } from "vitest"
import { decodoAdapter as adapter } from "./decodo"

const KEY = "dc-key"
const HEADERS = { Authorization: KEY }
const SUBSCRIPTIONS_URL = "https://api.decodo.com/v2/subscriptions"
const SUB_USERS_URL =
  "https://api.decodo.com/v2/sub-users?service_type=residential_proxies"

afterEach(() => vi.restoreAllMocks())

// Example responses from the API reference (help.decodo.com, fetched
// 2026-10-17). Get subscriptions: traffic_limit is a string (GB).
const SUBSCRIPTION = {
  traffic_limit: "50",
  traffic_per_period: "0.15",
  users_limit: 3,
  ip_address_limit: 2,
  valid_from: "2018-11-08",
  valid_until: "2019-06-30",
  service_type: "residential_proxies",
}
// Get sub users: traffic is the sub-user's usage (GB).
const SUB_USER = {
  id: 24570,
  username: "name",
  status: "active",
  created_at: "2019-03-23 13:08",
  traffic: 1.13,
  traffic_limit: null,
  service_type: "residential_proxies",
  traffic_count_from: "2019-03-23 13:10",
  auto_disable: false,
}

const UNEXPECTED = {
  ok: false,
  error: "Decodo returned an unexpected response.",
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

const traffic = (balance: number, limit: number) => ({
  ok: true,
  balances: [
    {
      creditType: "traffic",
      label: "Residential traffic",
      balance,
      balanceLimit: limit,
      unit: "gb",
    },
  ],
})

describe("Decodo adapter", () => {
  it("subtracts the sub-users' traffic from the residential limit", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: [SUBSCRIPTION] },
      { status: 200, body: [SUB_USER, { ...SUB_USER, id: 2, traffic: 3.87 }] }
    )
    expect(await adapter.readBalance(KEY)).toEqual(traffic(45, 50))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      SUBSCRIPTIONS_URL,
      expect.objectContaining({ headers: HEADERS })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      SUB_USERS_URL,
      expect.objectContaining({ headers: HEADERS })
    )
  })

  it("reads the docs' single-object subscription shape too", async () => {
    stubFetch(
      { status: 200, body: SUBSCRIPTION },
      { status: 200, body: [SUB_USER] }
    )
    expect(await adapter.readBalance(KEY)).toEqual(traffic(48.87, 50))
  })

  it("sums several residential subscriptions and ignores other services", async () => {
    stubFetch(
      {
        status: 200,
        body: [
          SUBSCRIPTION,
          { ...SUBSCRIPTION, traffic_limit: "25" },
          {
            ...SUBSCRIPTION,
            traffic_limit: "x",
            service_type: "mobile_proxies",
          },
        ],
      },
      { status: 200, body: [] }
    )
    expect(await adapter.readBalance(KEY)).toEqual(traffic(75, 75))
  })

  it("an empty sub-user list means nothing used: balance = limit", async () => {
    stubFetch({ status: 200, body: [SUBSCRIPTION] }, { status: 200, body: [] })
    expect(await adapter.readBalance(KEY)).toEqual(traffic(50, 50))
  })

  it("usage over the limit floors at 0", async () => {
    stubFetch(
      { status: 200, body: [SUBSCRIPTION] },
      { status: 200, body: [{ ...SUB_USER, traffic: 60 }] }
    )
    expect(await adapter.readBalance(KEY)).toEqual(traffic(0, 50))
  })

  it("no residential subscription is unexpected, without a second call", async () => {
    const fetchMock = stubFetch({
      status: 200,
      body: [{ ...SUBSCRIPTION, service_type: "mobile_proxies" }],
    })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    stubFetch({ status: 200, body: [] })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("a non-numeric traffic_limit is unexpected, never 0", async () => {
    stubFetch({
      status: 200,
      body: [{ ...SUBSCRIPTION, traffic_limit: "unlimited" }],
    })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("maps 401 and 403 to a rejected key", async () => {
    // 401 body observed with a dummy key on 2026-10-17.
    stubFetch({
      status: 401,
      body: { error_code: "unauthorized", message: "Invalid Api key provided" },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Decodo rejected this key.",
    })
    stubFetch({ status: 403, body: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Decodo rejected this key.",
    })
  })

  it("reports 429 and a 500 on sub-users by status", async () => {
    stubFetch({ status: 429, body: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Decodo returned 429.",
    })
    stubFetch({ status: 200, body: [SUBSCRIPTION] }, { status: 500, body: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Decodo returned 500.",
    })
  })

  it("treats malformed bodies as unexpected", async () => {
    stubFetch({ status: 200, body: "not json{" })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch({ status: 200, body: [SUBSCRIPTION] }, { status: 200, body: {} })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch(
      { status: 200, body: [SUBSCRIPTION] },
      { status: 200, body: [{ ...SUB_USER, traffic: null }] }
    )
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("maps a network failure to an unreachable error", async () => {
    stubFetch("fail")
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach Decodo.",
    })
    stubFetch({ status: 200, body: [SUBSCRIPTION] }, "fail")
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach Decodo.",
    })
  })
})
