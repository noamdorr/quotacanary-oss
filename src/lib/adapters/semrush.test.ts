import { afterEach, describe, expect, it, vi } from "vitest"
import { semrushAdapter } from "./semrush"

afterEach(() => vi.restoreAllMocks())

describe("semrush adapter", () => {
  it("returns remaining API units from the CSV balance response", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => "1,250\n",
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await semrushAdapter.readBalance("semrush-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.semrush.com/users/countapiunits.html?key=semrush-key",
      {
        headers: {
          Accept: "text/csv, text/plain;q=0.9, application/json;q=0.8",
        },
      }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "units",
          label: "API Units",
          balance: 1250,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("URL-encodes API keys in the balance request", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          text: async () => "42",
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    await semrushAdapter.readBalance("key with spaces")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.semrush.com/users/countapiunits.html?key=key%20with%20spaces",
      expect.any(Object)
    )
  })

  it("returns a key rejection for invalid-key responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 400,
            text: async () =>
              JSON.stringify({
                errors: [{ field: "key", message: "invalid api key: nope" }],
              }),
          }) as unknown as Response
      )
    )

    const result = await semrushAdapter.readBalance("nope")

    expect(result).toEqual({
      ok: false,
      error: "Semrush rejected this key.",
    })
  })

  it("returns an error on an unparsable balance body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () => "not a number",
          }) as unknown as Response
      )
    )

    const result = await semrushAdapter.readBalance("semrush-key")

    expect(result).toEqual({
      ok: false,
      error: "Semrush returned an unexpected response.",
    })
  })
})
