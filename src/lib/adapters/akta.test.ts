import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("akta")
const KEY = "akta-key"

afterEach(() => vi.restoreAllMocks())

// GET /mcp/account, the fields the vendor's own CLI renders (akta-pro-cli
// commands/account.py; the client returns the JSON as-is, no envelope).
// Credits are fractional (news signals cost 0.1 a call). Values illustrative;
// confirm on the first live reading.
const REAL_RESPONSE = {
  package_type: "pay_as_you_go",
  is_enterprise: false,
  credit_balance: 812.4,
  currency: "USD",
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

describe("akta adapter", () => {
  it("reads the credit balance with an x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.akta.pro/api/v1/mcp/account",
      expect.objectContaining({
        headers: { "x-api-key": "akta-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 812.4,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, { detail: "Invalid API key" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Akta rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Akta returned 429.",
    })
  })

  it("fails on a body without credit_balance", async () => {
    stubFetch(200, { package_type: "pay_as_you_go", currency: "USD" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Akta returned an unexpected response.",
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
    expect((await adapter.readBalance(KEY)).ok).toBe(false)
  })
})
