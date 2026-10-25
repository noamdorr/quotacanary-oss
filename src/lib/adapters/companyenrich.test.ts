import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("companyenrich")
const KEY = "companyenrich-key"

afterEach(() => vi.restoreAllMocks())

// GET /me shape from the vendor's OpenAPI (ApiUserInfo + CreditInfo, both
// fields int32). Values illustrative; confirm on the first live reading.
const REAL_RESPONSE = {
  userId: "3f1c2b9e-0d4a-4c8e-9a51-6f2d7e8b1c30",
  credits: { used: 1250, total: 5000 },
  capabilities: {
    lists: true,
    previews: true,
    companySearchLimit: 100,
    companySearchAsyncLimit: 10000,
    peopleSearchLimit: 100,
    searchTermLimit: 20,
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

describe("companyenrich adapter", () => {
  it("derives the balance from total minus used with a Bearer token", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.companyenrich.com/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer companyenrich-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 3750,
          balanceLimit: 5000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-19.
    stubFetch(401, {
      type: "https://tools.ietf.org/html/rfc9110#section-15.5.2",
      title: "Unauthorized",
      status: 401,
      detail:
        "Invalid or no authorization token provided. Please provide a valid token.",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "CompanyEnrich rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "CompanyEnrich returned 429.",
    })
  })

  it("fails on a body without credits.total", async () => {
    stubFetch(200, { credits: { used: 1250 } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "CompanyEnrich returned an unexpected response.",
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
