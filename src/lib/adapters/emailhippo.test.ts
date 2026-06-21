import { afterEach, describe, expect, it, vi } from "vitest"
import { emailhippoAdapter } from "./emailhippo"

afterEach(() => vi.restoreAllMocks())

describe("emailhippo adapter", () => {
  it("returns quota remaining and quota total", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            accountId: 1,
            licenseKey: "abc",
            quotaUsed: 250,
            quotaRemaining: 750,
            nextQuotaResetDate: "2026-07-01T00:00:00.000Z",
            reportedDate: "2026-06-15T00:00:00.000Z",
            errorSummary: null,
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await emailhippoAdapter.readBalance("key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hippoapi.com/customer/reports/v3/quota/key",
      { headers: { Accept: "application/json" } }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "quota",
          label: "Quota",
          balance: 750,
          balanceLimit: 1000,
          unit: "credits",
        },
      ],
    })
  })

  it("URL-encodes the license key", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ quotaUsed: 0, quotaRemaining: 10 }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    await emailhippoAdapter.readBalance("key with/slash")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hippoapi.com/customer/reports/v3/quota/key%20with%2Fslash",
      { headers: { Accept: "application/json" } }
    )
  })

  it("returns error on 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 400,
            json: async () => ({}),
          }) as unknown as Response
      )
    )

    const result = await emailhippoAdapter.readBalance("key")

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Email Hippo rejected this key."
    )
  })

  it("returns error when Email Hippo reports an error summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              quotaUsed: 0,
              quotaRemaining: 0,
              errorSummary: "Invalid license key.",
            }),
          }) as unknown as Response
      )
    )

    const result = await emailhippoAdapter.readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Email Hippo rejected the quota request.",
    })
  })

  it("returns an error when Email Hippo cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )

    const result = await emailhippoAdapter.readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach Email Hippo.",
    })
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

    const result = await emailhippoAdapter.readBalance("key")

    expect(result.ok).toBe(false)
  })
})
