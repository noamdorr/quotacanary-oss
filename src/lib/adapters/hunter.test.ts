import { afterEach, describe, expect, it, vi } from "vitest"
import { hunterAdapter } from "./hunter"

afterEach(() => vi.restoreAllMocks())

// Real (sanitized) /v2/account response. `available` is the monthly CAP,
// not the remaining balance; remaining = available - used.
const REAL_RESPONSE = {
  data: {
    plan_name: "Data-platform",
    plan_level: 5,
    reset_date: "2027-03-15",
    requests: {
      searches: { used: 0, available: 0 },
      verifications: { used: 480, available: 1000 },
    },
    calls: { used: 842, available: 1362 },
  },
}

describe("hunter adapter", () => {
  it("returns searches + verifications as separate pools (remaining vs cap)", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => REAL_RESPONSE,
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)
    const result = await hunterAdapter.readBalance("key")
    // Key rides in the Authorization header, never the URL query string.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hunter.io/v2/account",
      expect.objectContaining({
        headers: { Authorization: "Bearer key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "searches",
          label: "Searches",
          balance: 0,
          balanceLimit: 0,
          unit: "credits",
        },
        {
          creditType: "verifications",
          label: "Verifications",
          balance: 520,
          balanceLimit: 1000,
          unit: "credits",
        },
      ],
    })
  })

  it("returns error on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 401,
            json: async () => ({}),
          }) as unknown as Response
      )
    )
    const result = await hunterAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Hunter rejected this key."
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
    const result = await hunterAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
