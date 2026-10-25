import { afterEach, describe, expect, it, vi } from "vitest"
import { hlrlookupAdapter as adapter } from "./hlrlookup"

const KEY = "hlr-api-key"
const SECRET_VALUE = "hlr-api-secret"
const SECRET = JSON.stringify({ api_key: KEY, api_secret: SECRET_VALUE })
const ENDPOINT = "https://api.hlrlookup.com/apiv2/balance"

afterEach(() => vi.restoreAllMocks())

// The balance example on https://www.hlrlookup.com/knowledge (fetched
// 2026-10-20).
const REAL_RESPONSE = { body: { Status: "OK", Credits: 15000 } }

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
  creditType: "credits",
  label: "Credits",
  balance: 15000,
  balanceLimit: null,
  unit: "credits",
}

describe("HLR Lookup adapter", () => {
  it("posts the key and secret in the JSON body", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(SECRET)
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ api_key: KEY, api_secret: SECRET_VALUE }),
      })
    )
    expect(result).toEqual({ ok: true, balances: [READING] })
  })

  it("accepts the first:second compatibility form", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    expect(await adapter.readBalance(`${KEY}:${SECRET_VALUE}`)).toEqual({
      ok: true,
      balances: [READING],
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      api_key: KEY,
      api_secret: SECRET_VALUE,
    })
  })

  it("asks for both values when one is missing or blank", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    for (const secret of [
      JSON.stringify({ api_key: KEY }),
      JSON.stringify({ api_key: KEY, api_secret: " " }),
      KEY,
      `${KEY}:`,
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "HLR Lookup needs an API key and API secret.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects bad credentials on 401", async () => {
    // HLR Lookup answered a dummy key and secret with this on 2026-10-20.
    stubFetch(401, {
      error: "UNAUTHORIZED",
      message: "Invalid api_key or api_secret",
    })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "HLR Lookup rejected these credentials.",
    })
  })

  it("rejects bad credentials on 403", async () => {
    stubFetch(403)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "HLR Lookup rejected these credentials.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "HLR Lookup returned 429.",
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { body: { Status: "OK", Credits: 0 } })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("reads a decimal balance sent as a string", async () => {
    stubFetch(200, { body: { Status: "OK", Credits: "1234.5" } })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 1234.5 }],
    })
  })

  it("fails on a non-OK status or a missing balance instead of reading 0", async () => {
    for (const body of [
      { body: { Status: "ERROR", Credits: 15000 } },
      { body: { Status: "OK" } },
      { body: { Status: "OK", Credits: null } },
      { body: { Status: "OK", Credits: "lots" } },
      { Status: "OK", Credits: 15000 },
      null,
    ]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(SECRET)).toEqual({
        ok: false,
        error: "HLR Lookup returned an unexpected response.",
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
      error: "HLR Lookup returned an unexpected response.",
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
    expect(result).toEqual({ ok: false, error: "Couldn't reach HLR Lookup." })
    expect(JSON.stringify(result)).not.toContain(SECRET_VALUE)
  })
})
