import { afterEach, describe, expect, it, vi } from "vitest"
import { enrichcrmAdapter } from "./enrichcrm"

afterEach(() => vi.restoreAllMocks())

describe("enrichcrm adapter", () => {
  it("reads remaining credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ credits: 1234 }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await enrichcrmAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.enrich-crm.com/api/credit_crm/v1/mine?apiId=api-key",
      {
        headers: { Accept: "application/json" },
      }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1234,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("reads nested remaining credit fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ data: { remainingCredits: "456" } }),
          }) as unknown as Response
      )
    )

    const result = await enrichcrmAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 456,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns a useful error for gateway credit failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            json: async () => ({
              code: 13,
              message: "can't get credit",
              details: [],
            }),
          }) as unknown as Response
      )
    )

    const result = await enrichcrmAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Enrich CRM couldn't read credits for this key.",
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

    const result = await enrichcrmAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Enrich CRM returned an unexpected response.",
    })
  })

  it("returns an error when no balance can be found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ code: 0, message: "ok" }),
          }) as unknown as Response
      )
    )

    const result = await enrichcrmAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Enrich CRM returned an unexpected response.",
    })
  })
})
