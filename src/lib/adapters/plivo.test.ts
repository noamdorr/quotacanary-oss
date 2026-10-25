import { Buffer } from "node:buffer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { plivoAdapter as adapter } from "./plivo"

const FIRST = "MA2025RK4E639VJFZAGV"
const SECOND = "plivo-auth-token"
const SECRET = JSON.stringify({ auth_id: FIRST, auth_token: SECOND })
const ENDPOINT = "https://api.plivo.com/v1/Account/MA2025RK4E639VJFZAGV/"
const AUTH = `Basic ${Buffer.from(`${FIRST}:${SECOND}`).toString("base64")}`

afterEach(() => vi.restoreAllMocks())

// The Account object example on https://www.plivo.com/docs/account/api/account
// (fetched 2026-10-17).
const REAL_RESPONSE = {
  account_type: "standard",
  address: "Wayne Enterprises Inc.",
  api_id: "150892a0-922a-11e7-b6f4-061564b78b75",
  auth_id: "MA2025RK4E639VJFZAGV",
  auto_recharge: false,
  billing_mode: "prepaid",
  cash_credits: "1.80900",
  city: "Gotham",
  name: "Bruce Wayne",
  resource_uri: "/v1/Account/MA2025RK4E639VJFZAGV/",
  state: "NY",
  timezone: "America/New_York",
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
  label: "Balance (USD)",
  balance: 1.809,
  balanceLimit: null,
  unit: "usd",
}

describe("Plivo adapter", () => {
  it("reads the balance with two-value Basic auth", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(SECRET)
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        headers: { Accept: "application/json", Authorization: AUTH },
      })
    )
    expect(result).toEqual({ ok: true, balances: [READING] })
  })

  it("puts the Auth ID first and the Auth token second", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    await adapter.readBalance(SECRET)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const header = (init.headers as Record<string, string>).Authorization
    expect(Buffer.from(header.slice(6), "base64").toString()).toBe(
      `${FIRST}:${SECOND}`
    )
  })

  it("accepts the first:second compatibility form", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    expect(await adapter.readBalance(`${FIRST}:${SECOND}`)).toEqual({
      ok: true,
      balances: [READING],
    })
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, expect.anything())
  })

  it("percent-encodes the Auth ID in the path", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    await adapter.readBalance(
      JSON.stringify({ auth_id: "MA/../x", auth_token: SECOND })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.plivo.com/v1/Account/MA%2F..%2Fx/",
      expect.anything()
    )
  })

  it("asks for both values when one is missing or blank", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    for (const secret of [
      JSON.stringify({ auth_id: FIRST }),
      JSON.stringify({ auth_id: FIRST, auth_token: "  " }),
      SECOND,
      `:${SECOND}`,
      `${FIRST}:`,
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "Plivo needs an Auth ID and Auth token.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects bad credentials on 401", async () => {
    // Plivo answered a dummy Auth ID and token with a text/plain 401 on 2026-10-17.
    stubFetch(401, "Could not verify your access level for that URL.")
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Plivo rejected these credentials.",
    })
  })

  it("rejects bad credentials on 403", async () => {
    stubFetch(403)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Plivo rejected these credentials.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Plivo returned 429.",
    })
  })

  it("reports any other status", async () => {
    stubFetch(500)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Plivo returned 500.",
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { ...REAL_RESPONSE, cash_credits: "0.00000" })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("fails on a missing or non-numeric balance instead of reading 0", async () => {
    const { cash_credits: _omit, ...rest } = REAL_RESPONSE
    for (const body of [
      rest,
      { ...REAL_RESPONSE, cash_credits: "lots" },
      { ...REAL_RESPONSE, cash_credits: null },
      { ...REAL_RESPONSE, cash_credits: "" },
    ]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(SECRET)).toEqual({
        ok: false,
        error: "Plivo returned an unexpected response.",
      })
    }
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
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Plivo returned an unexpected response.",
    })
  })

  it("reports an unreachable host without echoing a credential", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await adapter.readBalance(SECRET)
    expect(result).toEqual({ ok: false, error: "Couldn't reach Plivo." })
    expect(JSON.stringify(result)).not.toContain(SECOND)
  })
})
