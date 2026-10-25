import { afterEach, describe, expect, it, vi } from "vitest"
import { brevoAdapter as adapter } from "./brevo"

const KEY = "brevo-key"

afterEach(() => vi.restoreAllMocks())

// The 200 example from Get account details
// (https://developers.brevo.com/reference/getaccount), trimmed to the
// identity fields and `plan[]` as published: a free plan, then sms.
const DOCS_EXAMPLE = {
  organization_id: "5fa2b8c123456789abcdef01",
  user_id: 1234567,
  enterprise: false,
  companyName: "Acme Marketing Corp",
  email: "michael.davis@example.com",
  plan: [
    { credits: 250, creditsType: "sendLimit", type: "free" },
    { credits: 15, creditsType: "sendLimit", type: "sms" },
  ],
}

// Built from the documented `plan[]` item schema (the docs carry no paid
// example): a subscription and pay-as-you-go credits on one account, plus sms,
// listed in the docs' enum order (payAsYouGo, subscription, sms).
const PAID_PLAN = [
  { credits: 1200, creditsType: "sendLimit", type: "payAsYouGo" },
  {
    credits: 4300,
    creditsType: "sendLimit",
    type: "subscription",
    startDate: "1759276800",
    endDate: "1761955200",
  },
  { credits: 80, creditsType: "sendLimit", type: "sms" },
]

const PAID_RESULT = {
  ok: true,
  balances: [
    {
      creditType: "emails",
      label: "Email credits",
      balance: 5500,
      balanceLimit: null,
      unit: "credits",
    },
    {
      creditType: "sms",
      label: "SMS credits",
      balance: 80,
      balanceLimit: null,
      unit: "credits",
    },
  ],
}

function stubFetch(status: number, body?: unknown) {
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

const unexpected = {
  ok: false,
  error: "Brevo returned an unexpected response.",
}

describe("Brevo adapter", () => {
  it("reads the docs example: free daily emails and sms, with the api-key header", async () => {
    const fetchMock = stubFetch(200, DOCS_EXAMPLE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/account",
      expect.objectContaining({
        headers: { Accept: "application/json", "api-key": KEY },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "sms",
          label: "SMS credits",
          balance: 15,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "free_emails",
          label: "Free daily emails",
          balance: 250,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("sums subscription and pay-as-you-go entries into one email pool", async () => {
    stubFetch(200, { ...DOCS_EXAMPLE, plan: PAID_PLAN })
    expect(await adapter.readBalance(KEY)).toEqual(PAID_RESULT)
  })

  it("selects by type, so a reordered plan[] reads the same balances", async () => {
    stubFetch(200, { ...DOCS_EXAMPLE, plan: [...PAID_PLAN].reverse() })
    expect(await adapter.readBalance(KEY)).toEqual(PAID_RESULT)
    stubFetch(200, {
      ...DOCS_EXAMPLE,
      plan: [PAID_PLAN[2], PAID_PLAN[0], PAID_PLAN[1]],
    })
    expect(await adapter.readBalance(KEY)).toEqual(PAID_RESULT)
  })

  it("reads sms alone when there is no email entry", async () => {
    stubFetch(200, { plan: [PAID_PLAN[2]] })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [PAID_RESULT.balances[1]],
    })
  })

  it("omits the sms pool when there is no sms entry", async () => {
    stubFetch(200, { plan: [PAID_PLAN[1]] })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [{ ...PAID_RESULT.balances[0], balance: 4300 }],
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, {
      plan: [{ credits: 0, creditsType: "sendLimit", type: "subscription" }],
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [{ ...PAID_RESULT.balances[0], balance: 0 }],
    })
  })

  it("ignores userLimit entries and reseller plans", async () => {
    stubFetch(200, {
      plan: [
        { credits: 50, creditsType: "userLimit", type: "subscription" },
        {
          credits: 9000,
          creditsType: "sendLimit",
          type: "reseller",
          userLimit: 10,
        },
        ...PAID_PLAN,
      ],
    })
    expect(await adapter.readBalance(KEY)).toEqual(PAID_RESULT)
  })

  it("fails when no entry matches a pool", async () => {
    for (const plan of [
      [],
      [{ credits: 50, creditsType: "userLimit", type: "subscription" }],
      [{ credits: 9000, creditsType: "sendLimit", type: "reseller" }],
      [{ credits: 10, creditsType: "sendLimit" }],
    ]) {
      stubFetch(200, { plan })
      expect(await adapter.readBalance(KEY)).toEqual(unexpected)
    }
  })

  it("fails on a missing or non-array plan", async () => {
    for (const body of [{}, { plan: null }, { plan: { type: "sms" } }, null]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(KEY)).toEqual(unexpected)
    }
  })

  it("fails on non-numeric credits in a matching entry instead of reading 0", async () => {
    for (const credits of ["lots", null, "", undefined]) {
      stubFetch(200, {
        plan: [
          PAID_PLAN[1],
          { credits, creditsType: "sendLimit", type: "payAsYouGo" },
        ],
      })
      expect(await adapter.readBalance(KEY)).toEqual(unexpected)
    }
  })

  it("rejects a bad key on 401", async () => {
    // Body observed with a dummy key on 2026-10-17.
    stubFetch(401, { message: "Key not found", code: "unauthorized" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Brevo rejected this key.",
    })
  })

  it("rejects a key without permission on 403", async () => {
    stubFetch(403, { code: "permission_denied", message: "denied" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Brevo rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Brevo returned 429.",
    })
  })

  it("reports any other status", async () => {
    stubFetch(500)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Brevo returned 500.",
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
    expect(await adapter.readBalance(KEY)).toEqual(unexpected)
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
      error: "Couldn't reach Brevo.",
    })
  })
})
