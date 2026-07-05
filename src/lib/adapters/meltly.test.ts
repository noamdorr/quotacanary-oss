import { afterEach, describe, expect, it, vi } from "vitest"
import { meltlyAdapter } from "./meltly"

afterEach(() => vi.restoreAllMocks())

describe("meltly adapter", () => {
  it("reads subscription and pay-as-you-go credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            subscriptionCredits: 12,
            paygCredits: 7,
            totalCredits: 19,
            credits: {
              total: 19,
              subscription: {
                remaining: 12,
                resets: true,
                resetsAt: "2026-07-13T00:00:00.000Z",
                active: true,
                status: "active",
                tier: 100,
              },
              payg: {
                remaining: 7,
                expires: false,
                expiresAt: null,
              },
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await meltlyAdapter.readBalance("melt-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://melt.ly/api/user/credits",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "x-api-key": "melt-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "subscription",
          label: "Subscription Credits",
          balance: 12,
          balanceLimit: 100,
          unit: "credits",
        },
        {
          creditType: "payg",
          label: "Pay-as-you-go Credits",
          balance: 7,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("falls back to top-level credit fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              subscriptionCredits: "5",
              paygCredits: 2,
            }),
          }) as unknown as Response
      )
    )

    const result = await meltlyAdapter.readBalance("melt-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "subscription",
          label: "Subscription Credits",
          balance: 5,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "payg",
          label: "Pay-as-you-go Credits",
          balance: 2,
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

    const result = await meltlyAdapter.readBalance("bad-key")

    expect(result).toEqual({
      ok: false,
      error: "Melt.ly rejected this key.",
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
              error: "Invalid API key",
            }),
          }) as unknown as Response
      )
    )

    const result = await meltlyAdapter.readBalance("bad-key")

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

    const result = await meltlyAdapter.readBalance("melt-key")

    expect(result).toEqual({
      ok: false,
      error: "Melt.ly returned an unexpected response.",
    })
  })

  it("returns an error when no balances are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          }) as unknown as Response
      )
    )

    const result = await meltlyAdapter.readBalance("melt-key")

    expect(result).toEqual({
      ok: false,
      error: "Melt.ly returned an unexpected response.",
    })
  })
})
