import { afterEach, describe, expect, it, vi } from "vitest"
import { builtwithAdapter } from "./builtwith"

afterEach(() => vi.restoreAllMocks())

describe("builtwith adapter", () => {
  it("reads remaining API credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            credits_total: 10000,
            credits_used: 1234,
            credits_available: "8766",
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await builtwithAdapter.readBalance("builtwith-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://payments.builtwith.com/v1/billing/api-discovery",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: "Bearer builtwith-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "API Credits",
          balance: 8766,
          balanceLimit: 10000,
          unit: "credits",
        },
      ],
    })
  })

  it("allows a missing total credit cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              credits_available: 420,
            }),
          }) as unknown as Response
      )
    )

    const result = await builtwithAdapter.readBalance("builtwith-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "API Credits",
          balance: 420,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns auth errors", async () => {
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

    const result = await builtwithAdapter.readBalance("bad-key")

    expect(result).toEqual({
      ok: false,
      error: "BuiltWith rejected this key.",
    })
  })

  it("returns suspended billing errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 403,
            json: async () => ({}),
          }) as unknown as Response
      )
    )

    const result = await builtwithAdapter.readBalance("disabled-key")

    expect(result).toEqual({
      ok: false,
      error: "BuiltWith billing is suspended for this account.",
    })
  })

  it("returns vendor-level errors from non-OK JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 400,
            json: async () => ({
              message: "Agent API Billing is not enabled.",
            }),
          }) as unknown as Response
      )
    )

    const result = await builtwithAdapter.readBalance("not-enabled-key")

    expect(result).toEqual({
      ok: false,
      error: "Agent API Billing is not enabled.",
    })
  })

  it("returns an error on non-JSON responses", async () => {
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

    const result = await builtwithAdapter.readBalance("builtwith-key")

    expect(result).toEqual({
      ok: false,
      error: "BuiltWith returned an unexpected response.",
    })
  })

  it("returns an error when the credit balance is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              credits_total: 10000,
              credits_used: 1234,
            }),
          }) as unknown as Response
      )
    )

    const result = await builtwithAdapter.readBalance("builtwith-key")

    expect(result).toEqual({
      ok: false,
      error: "BuiltWith returned an unexpected response.",
    })
  })

  it("returns an error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )

    const result = await builtwithAdapter.readBalance("builtwith-key")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach BuiltWith.",
    })
  })
})
