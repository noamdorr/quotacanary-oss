import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("similarweb")
const KEY = "sw key"

afterEach(() => vi.restoreAllMocks())

// Example GET /capabilities response from the Similarweb developer docs
// (Check Capabilities), trimmed as the docs trim it. The call costs no data
// credits.
const REAL_RESPONSE = {
  remaining_hits: 24763083,
  web_desktop_data: {
    snapshot_interval: { start_date: "2020-10-01", end_date: "2023-10-31" },
    countries: [
      { code: "AR", name: "Argentina" },
      { code: "AU", name: "Australia" },
    ],
  },
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }) as unknown as Response
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("similarweb adapter", () => {
  it("reads the data credits left with the api_key query parameter", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.similarweb.com/capabilities?api_key=sw%20key",
      expect.anything()
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "data_credits",
          label: "Data credits",
          balance: 24763083,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17: a plain-text "invalid API key".
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 401,
            json: async () => {
              throw new Error("not json")
            },
          }) as unknown as Response
      )
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Similarweb rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Similarweb returned 429.",
    })
  })

  it("fails on a body without remaining_hits", async () => {
    stubFetch(200, { web_desktop_data: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Similarweb returned an unexpected response.",
    })
  })

  it("fails on a non-JSON body", async () => {
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
    expect((await adapter.readBalance(KEY)).ok).toBe(false)
  })
})
