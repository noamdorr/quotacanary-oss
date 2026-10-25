import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("aiark")
const KEY = "aiark-key"

afterEach(() => vi.restoreAllMocks())

// Example GET /payments/credits response from the AI Ark docs (Fetch Credit).
const REAL_RESPONSE = {
  total: 100,
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

describe("aiark adapter", () => {
  it("reads the credit total with the X-TOKEN and JSON content-type headers", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.ai-ark.com/api/developer-portal/v1/payments/credits",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "X-TOKEN": "aiark-key",
        },
      })
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
    // Observed with a dummy key on 2026-10-18; the docs list no error codes.
    stubFetch(401, {
      message: "Unauthorized",
      request_id: "67ff5105e754d872036ede28feb3dc30",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "AI Ark rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "AI Ark returned 429.",
    })
  })

  it("fails on a body without total", async () => {
    stubFetch(200, { credits: 100 })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "AI Ark returned an unexpected response.",
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
