import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("dropleads")
const KEY = "dropleads-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /api/v2/prime-db/credits/balance response from the DropLeads docs;
// the docs leave the booleans as placeholders.
const REAL_RESPONSE = {
  success: true,
  credits: {
    availableCredits: 4999,
    paygCredits: 0,
    totalCredits: 5000,
    usePayg: false,
    totalAvailable: 4999,
    creditRate: 0.2,
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

describe("dropleads adapter", () => {
  it("reads available of total credits with the X-API-Key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://prime.dropleads.io/api/v2/prime-db/credits/balance",
      expect.objectContaining({
        headers: { "X-API-Key": "dropleads-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 4999,
          balanceLimit: 5000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-18.
    stubFetch(401, {
      success: false,
      error: "Authentication required",
      message:
        "Please provide either an API key (X-API-Key header) or a valid session token (Authorization: Bearer)",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "DropLeads rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "DropLeads returned 429.",
    })
  })

  it("fails on a body without credits.totalAvailable", async () => {
    stubFetch(200, { success: true, totalAvailable: 4999 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "DropLeads returned an unexpected response.",
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
