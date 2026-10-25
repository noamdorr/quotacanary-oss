import { Buffer } from "node:buffer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { twilioAdapter as adapter } from "./twilio"

const FIRST = "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const SECOND = "twilio-auth-token"
const SECRET = JSON.stringify({ account_sid: FIRST, auth_token: SECOND })
const ENDPOINT =
  "https://api.twilio.com/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Balance.json"
const AUTH = `Basic ${Buffer.from(`${FIRST}:${SECOND}`).toString("base64")}`

afterEach(() => vi.restoreAllMocks())

// The `fetch` example for GET /2010-04-01/Accounts/{AccountSid}/Balance.json in
// twilio-oai spec/json/twilio_api_v2010.json (schema api.v2010.account.balance).
const REAL_RESPONSE = {
  account_sid: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  balance: "0.05",
  currency: "USD",
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
  balance: 0.05,
  balanceLimit: null,
  unit: "usd",
}

describe("Twilio adapter", () => {
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

  it("puts the Account SID first and the Auth token second", async () => {
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

  it("refuses a non-USD balance rather than mislabel it", async () => {
    stubFetch(200, { ...REAL_RESPONSE, currency: "EUR" })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Twilio returned an unexpected response.",
    })
  })

  it("reads a balance whose currency field is absent", async () => {
    const { currency: _omit, ...rest } = REAL_RESPONSE
    stubFetch(200, rest)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [READING],
    })
  })

  it("percent-encodes the Account SID in the path", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    await adapter.readBalance(
      JSON.stringify({ account_sid: "AC/../x", auth_token: SECOND })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC%2F..%2Fx/Balance.json",
      expect.anything()
    )
  })

  it("asks for both values when one is missing or blank", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    for (const secret of [
      JSON.stringify({ account_sid: FIRST }),
      JSON.stringify({ account_sid: FIRST, auth_token: "  " }),
      SECOND,
      `:${SECOND}`,
      `${FIRST}:`,
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "Twilio needs an Account SID and Auth token.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects bad credentials on 401", async () => {
    // Body observed with a dummy SID and token on 2026-10-17.
    stubFetch(401, {
      code: 20003,
      message: "Authentication Error - invalid username",
      more_info: "https://www.twilio.com/docs/errors/20003",
      status: 401,
    })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Twilio rejected these credentials.",
    })
  })

  it("rejects bad credentials on 403", async () => {
    stubFetch(403)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Twilio rejected these credentials.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Twilio returned 429.",
    })
  })

  it("reports any other status", async () => {
    stubFetch(500)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Twilio returned 500.",
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { ...REAL_RESPONSE, balance: "0.00" })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("fails on a missing or non-numeric balance instead of reading 0", async () => {
    const { balance: _omit, ...rest } = REAL_RESPONSE
    for (const body of [
      rest,
      { ...REAL_RESPONSE, balance: "lots" },
      { ...REAL_RESPONSE, balance: null },
      { ...REAL_RESPONSE, balance: "" },
    ]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(SECRET)).toEqual({
        ok: false,
        error: "Twilio returned an unexpected response.",
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
      error: "Twilio returned an unexpected response.",
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
    expect(result).toEqual({ ok: false, error: "Couldn't reach Twilio." })
    expect(JSON.stringify(result)).not.toContain(SECOND)
  })
})
