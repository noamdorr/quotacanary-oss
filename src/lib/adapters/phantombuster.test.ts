import { afterEach, describe, expect, it, vi } from "vitest"
import { phantombusterAdapter as adapter } from "./phantombuster"

const KEY = "pb-key"

afterEach(() => vi.restoreAllMocks())

// No live sanitized response exists in this lane: this fixture is built from
// the 200 schema embedded in
// https://hub.phantombuster.com/reference/get_orgs-fetch-resources (every
// required field present, values invented). The top-level counters are read
// as USAGE (QUO-229 hypothesis, unconfirmed live).
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    dailyExecutionTime: 12,
    dailyMail: 0,
    dailyCaptcha: 0,
    dailyDiscoveredMail: 0,
    dailyAiCredit: 40,
    dailySerpCredits: 0,
    monthlyExecutionTime: 300,
    monthlyMail: 100,
    monthlyCaptcha: 0,
    monthlyDiscoveredMail: 0,
    monthlyAiCredit: 2500,
    monthlySerpCredits: 0,
    s3Storage: 1024,
    agentCount: 3,
    planName: "Starter",
    plan: {
      name: "Starter",
      s3Storage: 10000,
      mongoStorage: 10000,
      parallelism: 1,
      agents: 5,
      scripts: 5,
      dailyExecutionTime: 0,
      dailyMails: 0,
      dailyCaptchas: 0,
      dailyDiscoveredMails: 0,
      dailyAiCredits: 0,
      dailySerpCredits: 0,
      monthlyExecutionTime: 1200,
      monthlyMails: 500,
      monthlyCaptchas: 0,
      monthlyDiscoveredMails: 0,
      monthlyAiCredits: 10000,
      monthlySerpCredits: 0,
      isAvailable: true,
      isUpgradable: true,
      duration: 1,
      monthlyPrice: 69,
      yearlyPrice: 672,
    },
    dailyResourceNextResetAt: 1792368000000,
    monthlyResourceNextResetAt: 1793491200000,
    planShouldCancelAt: null,
    topUps: {
      emailCredits: [
        { id: "tu_1", amount: 1000, remaining: 400, expiresAt: 1800000000000 },
        { id: "tu_2", amount: 500, remaining: 500, expiresAt: 1810000000000 },
      ],
      aiCredits: [
        { id: "tu_3", amount: 5000, remaining: 0, expiresAt: 1800000000000 },
        { id: "tu_4", amount: 2000, remaining: "lots", expiresAt: 1 },
      ],
    },
    ...overrides,
  }
}

const POOL = (
  creditType: string,
  label: string,
  balance: number,
  balanceLimit: number,
  unit = "credits"
) => ({ creditType, label, balance, balanceLimit, unit })

const UNEXPECTED = {
  ok: false,
  error: "PhantomBuster returned an unexpected response.",
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
          if (typeof body === "string") return JSON.parse(body)
          return body
        },
      }) as unknown as Response
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("PhantomBuster adapter", () => {
  it("reads three pools, summing top-ups into balance and limit", async () => {
    const fetchMock = stubFetch(200, fixture())
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.phantombuster.com/api/v2/orgs/fetch-resources",
      expect.objectContaining({
        headers: { "X-Phantombuster-Key": KEY, Accept: "application/json" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        POOL("execution_time", "Execution time", 900, 1200, "minutes"),
        // 10000 - 2500 + 0 (the "lots" lot is skipped whole).
        POOL("ai_credits", "AI credits", 7500, 15000),
        // 500 - 100 + 400 + 500.
        POOL("emails", "Emails", 1300, 2000),
      ],
    })
  })

  it("uses the plan limit alone when there are no top-ups", async () => {
    stubFetch(200, fixture({ topUps: null }))
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [
        POOL("execution_time", "Execution time", 900, 1200, "minutes"),
        POOL("ai_credits", "AI credits", 7500, 10000),
        POOL("emails", "Emails", 400, 500),
      ],
    })
  })

  it("drops a pool whose plan limit is 0 or missing", async () => {
    const base = fixture()
    const { monthlyMails: _dropped, ...planWithoutMails } = base.plan
    stubFetch(
      200,
      fixture({
        plan: { ...planWithoutMails, monthlyAiCredits: 0 },
        topUps: undefined,
      })
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [
        POOL("execution_time", "Execution time", 900, 1200, "minutes"),
      ],
    })
  })

  it("keeps a fully spent pool as a real zero", async () => {
    stubFetch(200, fixture({ monthlyExecutionTime: 1200 }))
    const result = await adapter.readBalance(KEY)
    expect(result.ok && result.balances[0]).toEqual(
      POOL("execution_time", "Execution time", 0, 1200, "minutes")
    )
  })

  it("fails when a counter exceeds its plan limit (inverted semantics guard)", async () => {
    stubFetch(200, fixture({ monthlyAiCredit: 10001 }))
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("fails on a missing or negative counter instead of reading 0", async () => {
    for (const value of [undefined, null, "lots", -1]) {
      stubFetch(200, fixture({ monthlyMail: value }))
      expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    }
  })

  it("fails when every plan limit is missing", async () => {
    stubFetch(200, fixture({ plan: { name: "Starter" } }))
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch(200, fixture({ plan: undefined }))
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("rejects a bad key on 401 and 403", async () => {
    // 401 {"status":"error","error":"API key not found"} observed with a
    // dummy key on 2026-10-17; the vendor text is never passed through.
    stubFetch(401, { status: "error", error: "API key not found" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "PhantomBuster rejected this key.",
    })
    stubFetch(403, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "PhantomBuster rejected this key.",
    })
  })

  it("reports 429 and other statuses by number", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "PhantomBuster returned 429.",
    })
    stubFetch(500, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "PhantomBuster returned 500.",
    })
  })

  it("fails on malformed JSON or a non-object body", async () => {
    stubFetch(200, "not json{")
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch(200, [])
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("reports an unreachable host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach PhantomBuster.",
    })
  })
})
