import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("sixtyfour")

afterEach(() => vi.restoreAllMocks())

// /check-balance returns one field, the organization's credit balance.
const REAL_RESPONSE = { credits: 10.0 }

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

describe("sixtyfour adapter", () => {
  it("reads the organization credit balance with the x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("sf_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sixtyfour.ai/check-balance",
      expect.objectContaining({ headers: { "x-api-key": "sf_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 10,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, { detail: "Invalid API key" })
    expect(await adapter.readBalance("sf_key")).toEqual({
      ok: false,
      error: "Sixtyfour rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, { detail: "Rate limit exceeded" })
    expect(await adapter.readBalance("sf_key")).toEqual({
      ok: false,
      error: "Sixtyfour returned 429.",
    })
  })

  it("preserves a zero balance", async () => {
    stubFetch(200, { credits: 0 })
    expect(await adapter.readBalance("sf_key")).toMatchObject({
      ok: true,
      balances: [{ balance: 0 }],
    })
  })

  it("fails on a body without credits", async () => {
    stubFetch(200, { detail: "ok" })
    expect(await adapter.readBalance("sf_key")).toEqual({
      ok: false,
      error: "Sixtyfour returned an unexpected response.",
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
    expect((await adapter.readBalance("sf_key")).ok).toBe(false)
  })
})
