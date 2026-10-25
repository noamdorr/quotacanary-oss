import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("scrapecreators")

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/account/credit-balance response from the Scrape Creators
// docs (as captured in treg's catalog).
const REAL_RESPONSE = {
  success: true,
  creditCount: 19860,
  message: "You have 19860 credits remaining.",
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

describe("scrapecreators adapter", () => {
  it("reads the remaining credits with the x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("sc_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.scrapecreators.com/v1/account/credit-balance",
      expect.objectContaining({ headers: { "x-api-key": "sc_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 19860,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, { success: false })
    expect(await adapter.readBalance("sc_key")).toEqual({
      ok: false,
      error: "Scrape Creators rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("sc_key")).toEqual({
      ok: false,
      error: "Scrape Creators returned 429.",
    })
  })

  it("preserves a zero balance", async () => {
    stubFetch(200, { success: true, creditCount: 0 })
    expect(await adapter.readBalance("sc_key")).toMatchObject({
      ok: true,
      balances: [{ balance: 0 }],
    })
  })

  it("fails on a body without creditCount", async () => {
    stubFetch(200, { success: true })
    expect(await adapter.readBalance("sc_key")).toEqual({
      ok: false,
      error: "Scrape Creators returned an unexpected response.",
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
    expect((await adapter.readBalance("sc_key")).ok).toBe(false)
  })
})
