import { afterEach, describe, expect, it, vi } from "vitest"
import { tregAdapter as adapter } from "./treg"

const TOKEN = "treg-token"
const ORG_ID = "26314"
const SECRET = JSON.stringify({ api_token: TOKEN, org_id: ORG_ID })
const ENDPOINT = "https://treg.to/orgs/26314/balance"

afterEach(() => vi.restoreAllMocks())

// The 200 a CLI user token got on 2026-10-29, trimmed: the real body also
// carries a recent-ledger page under entries.items, which the adapter ignores.
const REAL_RESPONSE = {
  org_id: 26314,
  balance_micro: 5147475,
  balance_usd: 5.147475,
  promo_grant_micro: 5000000,
  blocks: [
    {
      kind: "promotional",
      remaining_micro: 5147475,
      expires_at: "2027-01-27T00:00:00Z",
    },
  ],
  holds: [],
  entries: { limit: 50, offset: 0, items: [] },
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
  balance: 5.147475,
  balanceLimit: null,
  unit: "usd",
}

describe("treg adapter", () => {
  it("reads the org's USD balance with the token in X-Treg-Token", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(SECRET)
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        headers: { Accept: "application/json", "X-Treg-Token": TOKEN },
      })
    )
    expect(result).toEqual({ ok: true, balances: [READING] })
  })

  it("accepts the first:second compatibility form", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    expect(await adapter.readBalance(`${TOKEN}:${ORG_ID}`)).toEqual({
      ok: true,
      balances: [READING],
    })
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, expect.anything())
  })

  it("percent-encodes the org id in the path", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    await adapter.readBalance(
      JSON.stringify({ api_token: TOKEN, org_id: "1/../me" })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://treg.to/orgs/1%2F..%2Fme/balance",
      expect.anything()
    )
  })

  it("asks for both values when one is missing or blank", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    for (const secret of [
      JSON.stringify({ api_token: TOKEN }),
      JSON.stringify({ api_token: " ", org_id: ORG_ID }),
      TOKEN,
      `:${ORG_ID}`,
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "treg needs an API token and org ID.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a bad token on 401", async () => {
    // A Bearer header got this on 2026-10-29: treg reads only X-Treg-Token.
    stubFetch(401, { detail: "not authenticated" })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "treg rejected this token.",
    })
  })

  it("points at the org on 400, 403, 404 and 422", async () => {
    // 422 is a slug instead of the integer id (seen 2026-10-29); 400 is an
    // unpinned identity token asking for an org; 403 covers a token that may
    // not read this org (agent tokens are unconfirmed on this route).
    for (const status of [400, 403, 404, 422]) {
      stubFetch(status, { detail: "nope" })
      expect(await adapter.readBalance(SECRET)).toEqual({
        ok: false,
        error: "This treg token can't read the balance of this org ID.",
      })
    }
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "treg returned 429.",
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { ...REAL_RESPONSE, balance_usd: 0 })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("fails on a missing or non-numeric balance instead of reading 0", async () => {
    const { balance_usd: _omit, ...rest } = REAL_RESPONSE
    for (const body of [
      rest,
      { ...REAL_RESPONSE, balance_usd: null },
      { ...REAL_RESPONSE, balance_usd: "lots" },
      null,
    ]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(SECRET)).toEqual({
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
    expect(await adapter.readBalance(SECRET)).toEqual({
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
    const result = await adapter.readBalance(SECRET)
    expect(result).toEqual({ ok: false, error: "Couldn't reach treg." })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})
