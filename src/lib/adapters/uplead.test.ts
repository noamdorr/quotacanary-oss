import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("uplead")
const KEY = "uplead-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /v2/credits response from the UpLead API docs (Credits).
const REAL_RESPONSE = {
  data: {
    email: "user@example.com",
    credits: 100,
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

describe("uplead adapter", () => {
  it("reads the credit balance with the raw key as the Authorization header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.uplead.com/v2/credits",
      expect.objectContaining({ headers: { Authorization: "uplead-key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 100,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(401, { error: "API key is invalid." })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "UpLead rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "UpLead returned 429.",
    })
  })

  it("fails on a body without data.credits", async () => {
    stubFetch(200, { credits: 100 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "UpLead returned an unexpected response.",
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
