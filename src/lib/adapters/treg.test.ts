import { afterEach, describe, expect, it, vi } from "vitest"
import { tregAdapter as adapter } from "./treg"

const TOKEN = "treg-token"
const LEGACY = JSON.stringify({ api_token: TOKEN, org_id: "123456" })
const ME_URL = "https://treg.to/auth/me"
const ENDPOINT = "https://treg.to/orgs/123456/balance"
// Invented account metadata; no customer data.
const ME = {
  email: "someone@example.com",
  org_id: 123456,
  org: "synthetic-team",
  role: "owner",
}

afterEach(() => vi.restoreAllMocks())

// Synthetic billing values with the provider response shape. The ledger is empty.
const SYNTHETIC_RESPONSE = {
  org_id: 123456,
  balance_micro: 1250000,
  balance_usd: 1.25,
  promo_grant_micro: 2000000,
  blocks: [
    {
      kind: "promotional",
      remaining_micro: 1250000,
      expires_at: "2030-01-01T00:00:00Z",
    },
  ],
  holds: [],
  entries: { limit: 50, offset: 0, items: [] },
}

function reply(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

// /auth/me answers first, then the balance route.
function stubFetch(
  status: number,
  body?: unknown,
  meStatus = 200,
  meBody: unknown = ME
) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
    url === ME_URL ? reply(meStatus, meBody) : reply(status, body)
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const READING = {
  creditType: "balance",
  label: "Balance",
  balance: 1.25,
  balanceLimit: null,
  unit: "usd",
}
const HEADERS = { Accept: "application/json", "X-Treg-Token": TOKEN }
const NOT_TIED = "This treg token isn't tied to a team."

describe("treg adapter", () => {
  it("finds the org from the key, then reads its USD balance", async () => {
    const fetchMock = stubFetch(200, SYNTHETIC_RESPONSE)
    expect(await adapter.readBalance(TOKEN)).toEqual({
      ok: true,
      balances: [READING],
    })
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      ME_URL,
      ENDPOINT,
    ])
    for (const call of fetchMock.mock.calls)
      expect(call[1]).toEqual(expect.objectContaining({ headers: HEADERS }))
  })

  it("still reads a saved two-field secret and ignores its org id", async () => {
    for (const secret of [
      LEGACY,
      JSON.stringify({ api_token: TOKEN, org_id: "Synthetic Team" }),
    ]) {
      const fetchMock = stubFetch(200, SYNTHETIC_RESPONSE)
      expect(await adapter.readBalance(secret)).toEqual({
        ok: true,
        balances: [READING],
      })
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        ME_URL,
        ENDPOINT,
      ])
    }
  })

  it("asks for the token when it is blank, without sending", async () => {
    const fetchMock = stubFetch(200, SYNTHETIC_RESPONSE)
    for (const secret of [
      "",
      "  ",
      JSON.stringify({ api_token: " ", org_id: "123456" }),
      JSON.stringify({ org_id: "123456" }),
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "treg needs an API token.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("stops when /auth/me names no team", async () => {
    for (const me of [
      { email: "a@b.c" },
      { org_id: null },
      { org_id: "123456" },
      { org_id: 0 },
      { org_id: 1.5 },
      null,
    ]) {
      const fetchMock = stubFetch(200, SYNTHETIC_RESPONSE, 200, me)
      expect(await adapter.readBalance(TOKEN)).toEqual({
        ok: false,
        error: NOT_TIED,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it("rejects a bad token on 401 from either call", async () => {
    // A Bearer header got this on 2026-10-29: treg reads only X-Treg-Token.
    for (const [status, meStatus] of [
      [200, 401],
      [401, 200],
    ]) {
      stubFetch(status, { detail: "not authenticated" }, meStatus, {
        detail: "x",
        ...ME,
      })
      expect(await adapter.readBalance(TOKEN)).toEqual({
        ok: false,
        error: "treg rejected this token.",
      })
    }
  })

  it("says the token has no team on 400, 403 and 404", async () => {
    for (const status of [400, 403, 404]) {
      stubFetch(200, SYNTHETIC_RESPONSE, status, { detail: "nope" })
      expect(await adapter.readBalance(TOKEN)).toEqual({
        ok: false,
        error: NOT_TIED,
      })
      stubFetch(status, { detail: "nope" })
      expect(await adapter.readBalance(TOKEN)).toEqual({
        ok: false,
        error: NOT_TIED,
      })
    }
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(TOKEN)).toEqual({
      ok: false,
      error: "treg returned 429.",
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { ...SYNTHETIC_RESPONSE, balance_usd: 0 })
    expect(await adapter.readBalance(TOKEN)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("fails on a missing or non-numeric balance instead of reading 0", async () => {
    const { balance_usd: _omit, ...rest } = SYNTHETIC_RESPONSE
    for (const body of [
      rest,
      { ...SYNTHETIC_RESPONSE, balance_usd: null },
      { ...SYNTHETIC_RESPONSE, balance_usd: "lots" },
      null,
    ]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(TOKEN)).toEqual({
        ok: false,
        error: "treg returned an unexpected response.",
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
    expect(await adapter.readBalance(TOKEN)).toEqual({
      ok: false,
      error: "treg returned an unexpected response.",
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
    const result = await adapter.readBalance(TOKEN)
    expect(result).toEqual({ ok: false, error: "Couldn't reach treg." })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})
