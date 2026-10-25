import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("kickbox")

afterEach(() => vi.restoreAllMocks())

// Example GET /v2/balance response from Kickbox's published OpenAPI ("Get
// Credit Balance"); docs.kickbox.com documents the Bearer header and the
// { message, success } error envelope but does not link this route.
const REAL_RESPONSE = { balance: 1337, success: true, message: null }

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

describe("kickbox adapter", () => {
  it("reads the verification balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("live_key")
    // Key rides in the Authorization header, never the apikey query param.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.kickbox.com/v2/balance",
      expect.objectContaining({ headers: { Authorization: "Bearer live_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1337,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 403", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(403, {
      success: false,
      code: "FORBIDDEN",
      message: "Invalid API key",
    })
    expect(await adapter.readBalance("live_key")).toEqual({
      ok: false,
      error: "Kickbox rejected this key.",
    })
  })

  it("passes through a vendor message on a 200 with success false", async () => {
    stubFetch(200, { success: false, message: "Account suspended" })
    expect(await adapter.readBalance("live_key")).toEqual({
      ok: false,
      error: "Account suspended",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("live_key")).toEqual({
      ok: false,
      error: "Kickbox returned 429.",
    })
  })

  it("fails on a body without balance", async () => {
    stubFetch(200, { success: true, message: null })
    expect(await adapter.readBalance("live_key")).toEqual({
      ok: false,
      error: "Kickbox returned an unexpected response.",
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
    expect((await adapter.readBalance("live_key")).ok).toBe(false)
  })
})
