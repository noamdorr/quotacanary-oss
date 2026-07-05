import { afterEach, describe, expect, it, vi } from "vitest"
import { bettercontactAdapter } from "./bettercontact"

afterEach(() => vi.restoreAllMocks())

describe("bettercontact adapter", () => {
  it("reads remaining account credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            credits_left: 32377,
            email: "user@example.com",
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await bettercontactAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.bettercontact.rocks/api/v2/account",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "X-API-Key": "api-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 32377,
          balanceLimit: null,
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

    const result = await bettercontactAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "BetterContact rejected this key.",
    })
  })

  it("returns vendor-level errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              success: false,
              message: "Invalid API key",
            }),
          }) as unknown as Response
      )
    )

    const result = await bettercontactAdapter.readBalance("api-key")

    expect(result).toEqual({ ok: false, error: "Invalid API key" })
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

    const result = await bettercontactAdapter.readBalance("api-key")

    expect(result.ok).toBe(false)
  })
})
