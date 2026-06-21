import { afterEach, describe, expect, it, vi } from "vitest"
import { tavilyAdapter } from "./tavily"

afterEach(() => vi.restoreAllMocks())

describe("tavily adapter", () => {
  it("derives remaining plan, pay-as-you-go, and API key credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            key: {
              usage: 90,
              limit: 500,
              search_usage: 50,
              extract_usage: 20,
            },
            account: {
              current_plan: "Bootstrap",
              plan_usage: 1200,
              plan_limit: 15000,
              paygo_usage: 20,
              paygo_limit: 100,
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await tavilyAdapter.readBalance("tvly-key")

    expect(fetchMock).toHaveBeenCalledWith("https://api.tavily.com/usage", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer tvly-key",
      },
    })
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "plan",
          label: "Plan Credits",
          balance: 13800,
          balanceLimit: 15000,
          unit: "credits",
        },
        {
          creditType: "paygo",
          label: "Pay-as-you-go Credits",
          balance: 80,
          balanceLimit: 100,
          unit: "credits",
        },
        {
          creditType: "key",
          label: "API Key Credits",
          balance: 410,
          balanceLimit: 500,
          unit: "credits",
        },
      ],
    })
  })

  it("skips inactive pay-as-you-go and unlimited API key pools", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              key: {
                usage: 25,
                limit: null,
              },
              account: {
                current_plan: "Researcher",
                plan_usage: 250,
                plan_limit: 1000,
                paygo_usage: 0,
                paygo_limit: 0,
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await tavilyAdapter.readBalance("tvly-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "plan",
          label: "Plan Credits",
          balance: 750,
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

    const result = await tavilyAdapter.readBalance("tvly-key")

    expect(result).toEqual({
      ok: false,
      error: "Tavily rejected this key.",
    })
  })

  it("returns vendor-level detail errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              detail: {
                error:
                  "Your request has been blocked due to excessive requests.",
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await tavilyAdapter.readBalance("tvly-key")

    expect(result).toEqual({
      ok: false,
      error: "Your request has been blocked due to excessive requests.",
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

    const result = await tavilyAdapter.readBalance("tvly-key")

    expect(result.ok).toBe(false)
  })
})
