import { afterEach, describe, expect, it, vi } from "vitest"
import { rocketreachAdapter } from "./rocketreach"

afterEach(() => vi.restoreAllMocks())

// Real GET /api/v2/account/ response shape, captured live 2026-05-29 (PII
// stripped). credit_usage is an ARRAY of per-credit-type entries - the old
// mock invented a {credit_usage:{credits_remaining}} object that never existed.
const ACCOUNT_FIXTURE = {
  id: 1,
  state: "registered",
  credit_usage: [
    { credit_type: "standard_lookup", allocated: 5, used: 0, remaining: 5 },
    { credit_type: "premium_lookup", allocated: 0, used: 0, remaining: 0 },
    { credit_type: "phone_lookup", allocated: 0, used: 0, remaining: 0 },
    { credit_type: "person_enrich", allocated: 0, used: 0, remaining: 0 },
    { credit_type: "person_export", allocated: 0, used: 0, remaining: 0 },
    { credit_type: "company_export", allocated: 0, used: 0, remaining: 0 },
  ],
}

function stubFetch(
  body: unknown,
  init: { ok?: boolean; status?: number } = {}
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: init.ok ?? true,
          status: init.status ?? 200,
          json: async () => body,
        }) as unknown as Response
    )
  )
}

describe("rocketreach adapter", () => {
  it("reads remaining for each allocated credit type (real free-plan shape)", async () => {
    stubFetch(ACCOUNT_FIXTURE)
    const result = await rocketreachAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "standard_lookup",
          label: "Standard Lookup",
          balance: 5,
          balanceLimit: 5,
          unit: "credits",
        },
      ],
    })
  })

  it("returns one pool per credit type the plan allocates", async () => {
    stubFetch({
      credit_usage: [
        {
          credit_type: "standard_lookup",
          allocated: 1000,
          used: 200,
          remaining: 800,
        },
        { credit_type: "phone_lookup", allocated: 50, used: 0, remaining: 50 },
        { credit_type: "person_export", allocated: 0, used: 0, remaining: 0 },
      ],
    })
    const result = await rocketreachAdapter.readBalance("key")
    expect(result.ok).toBe(true)
    expect((result as { ok: true; balances: unknown[] }).balances).toEqual([
      {
        creditType: "standard_lookup",
        label: "Standard Lookup",
        balance: 800,
        balanceLimit: 1000,
        unit: "credits",
      },
      {
        creditType: "phone_lookup",
        label: "Phone Lookup",
        balance: 50,
        balanceLimit: 50,
        unit: "credits",
      },
    ])
  })

  it("returns error on 401", async () => {
    stubFetch({}, { ok: false, status: 401 })
    const result = await rocketreachAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "RocketReach rejected this key."
    )
  })

  it("returns an error on a non-JSON body", async () => {
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
    const result = await rocketreachAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
