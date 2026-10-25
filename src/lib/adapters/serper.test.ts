import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("serper")
const KEY = "serper-key"

afterEach(() => vi.restoreAllMocks())

// GET /account response shape. Serper does not document this route; the field
// comes from third-party readers (SyscallBrain/quotop src/providers/serper.rs).
// Values illustrative; confirm on the first live reading.
const REAL_RESPONSE = {
  balance: 2500,
  rateLimit: 50,
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

describe("serper adapter", () => {
  it("reads the credit balance with the X-API-KEY header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://google.serper.dev/account",
      expect.objectContaining({
        headers: { "X-API-KEY": "serper-key" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 2500,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 403", async () => {
    // Observed with a dummy key on 2026-10-18 (and with no key): Serper answers 403, not 401.
    stubFetch(403, { message: "Unauthorized.", statusCode: 403 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Serper rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Serper returned 429.",
    })
  })

  it("fails on a body without balance", async () => {
    stubFetch(200, { credits: 2500 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Serper returned an unexpected response.",
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
