import { Buffer } from "node:buffer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { vonageAdapter as adapter } from "./vonage"

const FIRST = "abcd1234"
const SECOND = "vonage-api-secret"
const SECRET = JSON.stringify({ api_key: FIRST, api_secret: SECOND })
const ENDPOINT = "https://rest.nexmo.com/account/get-balance"
const AUTH = `Basic ${Buffer.from(`${FIRST}:${SECOND}`).toString("base64")}`

afterEach(() => vi.restoreAllMocks())

// developer.vonage.com/en/api/account documents `value` (number, EUR) and
// `autoReload` but renders no example body; this is the get_balance fixture from
// Vonage/vonage-python-sdk (account/tests/data/get_balance.json).
const REAL_RESPONSE = {
  value: 29.18202293,
  autoReload: false,
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
  label: "Balance (EUR)",
  balance: 29.18202293,
  balanceLimit: null,
  unit: "eur",
}

describe("Vonage adapter", () => {
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

  it("puts the API key first and the API secret second", async () => {
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

  it("asks for both values when one is missing or blank", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    for (const secret of [
      JSON.stringify({ api_key: FIRST }),
      JSON.stringify({ api_key: FIRST, api_secret: "  " }),
      SECOND,
      `:${SECOND}`,
      `${FIRST}:`,
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "Vonage needs an API key and API secret.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects bad credentials on 401", async () => {
    // Problem-details body observed with a dummy key and secret on 2026-10-17.
    stubFetch(401, {
      type: "https://developer.nexmo.com/api-errors#unauthorized",
      title: "Unauthorized",
      detail: "You did not provide correct credentials.",
      instance: "7ef26f9c-b446-4572-9a3d-c65148be096e",
    })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Vonage rejected these credentials.",
    })
  })

  it("rejects bad credentials on 403", async () => {
    stubFetch(403)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Vonage rejected these credentials.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Vonage returned 429.",
    })
  })

  it("reports any other status", async () => {
    stubFetch(500)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Vonage returned 500.",
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { ...REAL_RESPONSE, value: 0 })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("fails on a missing or non-numeric balance instead of reading 0", async () => {
    const { value: _omit, ...rest } = REAL_RESPONSE
    for (const body of [
      rest,
      { ...REAL_RESPONSE, value: "lots" },
      { ...REAL_RESPONSE, value: null },
      { ...REAL_RESPONSE, value: "" },
    ]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(SECRET)).toEqual({
        ok: false,
        error: "Vonage returned an unexpected response.",
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
      error: "Vonage returned an unexpected response.",
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
    expect(result).toEqual({ ok: false, error: "Couldn't reach Vonage." })
    expect(JSON.stringify(result)).not.toContain(SECOND)
  })
})
