import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("instantly")

afterEach(() => vi.restoreAllMocks())

// Example GET /api/v2/workspace-billing/plan-details response from the
// Instantly API v2 docs (Workspace Billing -> Get workspace plan details),
// trimmed to the fields the catalog reads plus a few neighbours.
const REAL_RESPONSE = {
  organization_id: "01a1454a-1fe3-738b-abc8-d4f405cca4a4",
  organization_name: "My Default Workspace",
  subscriptions: {
    outreach: {
      plan_name: "Free Trial",
      addons_qty: 2,
      total_lead_limit: 100,
      current_lead_count: 10,
      base_lead_limit: 25000,
      interval: "month",
      product_id: "pid_g_v1",
    },
    credits: {
      plan_name: "Free Trial",
      total_credits: 100,
      available_credits: 75,
      interval: "month",
      product_id: "pid_gic_v1",
    },
    crm: { plan_name: "Growth CRM", available_credits: null, plan_limit: null },
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

describe("instantly adapter", () => {
  it("reads credits and leads as separate pools with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("inst_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.instantly.ai/api/v2/workspace-billing/plan-details",
      expect.objectContaining({ headers: { Authorization: "Bearer inst_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 75,
          balanceLimit: 100,
          unit: "credits",
        },
        {
          creditType: "leads",
          label: "Leads",
          balance: 90,
          balanceLimit: 100,
          unit: "credits",
        },
      ],
    })
  })

  it("reads leads alone when there is no credits subscription", async () => {
    stubFetch(200, {
      subscriptions: {
        outreach: { total_lead_limit: 25000, current_lead_count: 25000 },
      },
    })
    expect(await adapter.readBalance("inst_key")).toMatchObject({
      ok: true,
      balances: [{ creditType: "leads", balance: 0, balanceLimit: 25000 }],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid API key",
    })
    expect(await adapter.readBalance("inst_key")).toEqual({
      ok: false,
      error: "Instantly rejected this key.",
    })
  })

  it("reports the status on 402 (no active paid plan)", async () => {
    stubFetch(402, {})
    expect(await adapter.readBalance("inst_key")).toEqual({
      ok: false,
      error: "Instantly returned 402.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("inst_key")).toEqual({
      ok: false,
      error: "Instantly returned 429.",
    })
  })

  it("fails on a body without subscriptions", async () => {
    stubFetch(200, { organization_id: "01a1454a" })
    expect(await adapter.readBalance("inst_key")).toEqual({
      ok: false,
      error: "Instantly returned an unexpected response.",
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
    expect((await adapter.readBalance("inst_key")).ok).toBe(false)
  })
})
