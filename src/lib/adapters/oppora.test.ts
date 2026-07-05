import { afterEach, describe, expect, it, vi } from "vitest"
import { opporaAdapter } from "./oppora"

afterEach(() => vi.restoreAllMocks())

describe("oppora adapter", () => {
  it("reads remaining data and phone credit pools", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            data_credits: {
              remaining: "1240",
              used: 260,
              unlimited: false,
            },
            phone_credits: {
              remaining: 83,
              used: 17,
              unlimited: false,
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await opporaAdapter.readBalance("opp-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.oppora.ai/api/v1/public/credits",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: "Bearer opp-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "data",
          label: "Data Credits",
          balance: 1240,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "phone",
          label: "Phone Credits",
          balance: 83,
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

    const result = await opporaAdapter.readBalance("bad-key")

    expect(result).toEqual({
      ok: false,
      error: "Oppora rejected this key.",
    })
  })

  it("returns vendor-level errors from non-OK JSON responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 402,
            json: async () => ({
              error: {
                message: "API access requires a Pro plan.",
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await opporaAdapter.readBalance("starter-key")

    expect(result).toEqual({
      ok: false,
      error: "API access requires a Pro plan.",
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

    const result = await opporaAdapter.readBalance("opp-key")

    expect(result).toEqual({
      ok: false,
      error: "Oppora returned an unexpected response.",
    })
  })

  it("returns an error when no credit balances are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              data_credits: {
                used: 10,
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await opporaAdapter.readBalance("opp-key")

    expect(result).toEqual({
      ok: false,
      error: "Oppora returned an unexpected response.",
    })
  })

  it("returns an error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )

    const result = await opporaAdapter.readBalance("opp-key")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach Oppora.",
    })
  })
})
