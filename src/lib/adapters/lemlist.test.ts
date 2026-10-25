import { Buffer } from "node:buffer"
import { afterEach, describe, expect, it, vi } from "vitest"
import { lemlistAdapter as adapter } from "./lemlist"

const KEY = "lemlist-key"

afterEach(() => vi.restoreAllMocks())

// The 200 example from the Get Team Credits OpenAPI spec
// (https://developer.lemlist.com/api-reference/endpoints/team/get-team-credits).
const REAL_RESPONSE = {
  credits: 100,
  details: {
    remaining: {
      total: 100,
      freemium: 0,
      subscription: 80,
      gifted: 10,
      paid: 10,
    },
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

describe("lemlist adapter", () => {
  it("reads the team credit balance with empty-username Basic auth", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.lemlist.com/api/team/credits",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`:${KEY}`).toString("base64")}`,
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

  it("puts the colon before the key, never after it", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    await adapter.readBalance(KEY)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const header = (init.headers as Record<string, string>).Authorization
    expect(header.startsWith("Basic ")).toBe(true)
    expect(Buffer.from(header.slice(6), "base64").toString()).toBe(`:${KEY}`)
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { credits: 0, details: { remaining: { total: 0 } } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 0,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects a bad key on 401", async () => {
    // Text body observed with a dummy key on 2026-10-17 (also the docs example).
    stubFetch(401, "The authentication you supplied is incorrect")
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "lemlist rejected this key.",
    })
  })

  it("rejects a blocked user's key on 403", async () => {
    stubFetch(403, "User linked to this API key is blocked")
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "lemlist rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "lemlist returned 429.",
    })
  })

  it("reports any other status", async () => {
    stubFetch(500)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "lemlist returned 500.",
    })
  })

  it("fails on a body without credits instead of reading 0", async () => {
    stubFetch(200, { details: { remaining: { total: 100 } } })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "lemlist returned an unexpected response.",
    })
  })

  it("fails on non-numeric credits", async () => {
    for (const credits of ["lots", null, ""]) {
      stubFetch(200, { credits })
      expect(await adapter.readBalance(KEY)).toEqual({
        ok: false,
        error: "lemlist returned an unexpected response.",
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
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "lemlist returned an unexpected response.",
    })
  })

  it("reports an unreachable host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach lemlist.",
    })
  })
})
