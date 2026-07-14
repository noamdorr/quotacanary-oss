import { afterEach, describe, expect, it, vi } from "vitest"
import { keywordseverywhereAdapter } from "./keywordseverywhere"

afterEach(() => vi.restoreAllMocks())

describe("keywordseverywhere adapter", () => {
  it("reads the account credit balance", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => [95597755],
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await keywordseverywhereAdapter.readBalance("keywords-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.keywordseverywhere.com/v1/account/credits",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: "Bearer keywords-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 95597755,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("coerces numeric string balances", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ["12345"],
          }) as unknown as Response
      )
    )

    const result = await keywordseverywhereAdapter.readBalance("keywords-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 12345,
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

    const result = await keywordseverywhereAdapter.readBalance("bad-key")

    expect(result).toEqual({
      ok: false,
      error: "Keywords Everywhere rejected this key.",
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
            json: async () => ({ message: "Insufficient credits" }),
          }) as unknown as Response
      )
    )

    const result = await keywordseverywhereAdapter.readBalance("keywords-key")

    expect(result).toEqual({
      ok: false,
      error: "Insufficient credits",
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

    const result = await keywordseverywhereAdapter.readBalance("keywords-key")

    expect(result).toEqual({
      ok: false,
      error: "Keywords Everywhere returned an unexpected response.",
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
            json: async () => [],
          }) as unknown as Response
      )
    )

    const result = await keywordseverywhereAdapter.readBalance("keywords-key")

    expect(result).toEqual({
      ok: false,
      error: "Keywords Everywhere returned an unexpected response.",
    })
  })

  it("returns an error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )

    const result = await keywordseverywhereAdapter.readBalance("keywords-key")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach Keywords Everywhere.",
    })
  })
})
