import { afterEach, describe, expect, it, vi } from "vitest"
import { youcomAdapter as adapter } from "./youcom"

const KEY = "ydc-api-key"
const ENDPOINT = "https://api.you.com/v1/billing/account_balance"

afterEach(() => vi.restoreAllMocks())

// The example on https://you.com/docs/api-reference/billing/get-account-balance
// (fetched 2026-10-20): 718924.5 cents is $7,189.245.
const REAL_RESPONSE = {
  data: {
    type: "account",
    id: "e48a0acc172f1bd716527b65dcae373cf6d7a532dfb9fa6a1f962799eeaca84f",
    attributes: { balance: 718924.5 },
  },
}

function stubFetch(status: number, body?: unknown) {
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

const READING = {
  creditType: "balance",
  label: "Balance",
  balanceLimit: null,
  unit: "usd",
}

describe("youcom adapter", () => {
  it("reads the documented response as dollars from cents", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 7189.245 }],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        headers: { Accept: "application/json", "X-API-Key": KEY },
      })
    )
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { data: { attributes: { balance: 0 } } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("reads a balance sent as a numeric string", async () => {
    stubFetch(200, { data: { attributes: { balance: "1250" } } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 12.5 }],
    })
  })

  // Observed live on 2026-10-20 with a dummy key:
  // 401 {"detail":"Invalid or expired API key"}.
  it("maps 401 to a rejected key", async () => {
    stubFetch(401, { detail: "Invalid or expired API key" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "You.com rejected this key.",
    })
  })

  it("maps 403 to a key without billing scope", async () => {
    stubFetch(403, { detail: "Forbidden" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "This You.com key can't read the balance.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "You.com returned 429.",
    })
  })

  it("reports a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach You.com.",
    })
  })

  it("rejects a body without a balance", async () => {
    stubFetch(200, { data: { type: "account", attributes: {} } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "You.com returned an unexpected response.",
    })
  })

  it("rejects a non-JSON body", async () => {
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
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "You.com returned an unexpected response.",
    })
  })
})
