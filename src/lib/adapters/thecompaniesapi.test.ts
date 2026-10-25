import { afterEach, describe, expect, it, vi } from "vitest"
import { thecompaniesapiAdapter as adapter } from "./thecompaniesapi"

const TOKEN = "tca-api-token"
const TEAM_ID = "1"
const SECRET = JSON.stringify({ api_token: TOKEN, team_id: TEAM_ID })
const ENDPOINT = "https://api.thecompaniesapi.com/v2/teams/1"

afterEach(() => vi.restoreAllMocks())

// The Team example on https://www.thecompaniesapi.com/api/fetch-team
// (fetched 2026-10-20). The page shows the path as /v2/team/:teamId, but the
// OpenAPI spec (https://api.thecompaniesapi.com/v2/openapi) lists
// /v2/teams/{teamId}, and on 2026-10-20 a dummy token got 401 there and a 404
// "Cannot GET" on the singular path.
const REAL_RESPONSE = {
  country: "us",
  createdAt: "2020-06-29 08:21:01",
  credits: 500000,
  id: 1,
  isSubscriber: true,
  name: "Jay Gatsby Enterprises",
  websiteUrl: "https://www.jaygatsbyenterprises.com",
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
  creditType: "credits",
  label: "Credits",
  balance: 500000,
  balanceLimit: null,
  unit: "credits",
}

describe("The Companies API adapter", () => {
  it("reads the team's credits with the raw token as Basic", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(SECRET)
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${TOKEN}`,
        },
      })
    )
    expect(result).toEqual({ ok: true, balances: [READING] })
  })

  it("accepts the first:second compatibility form", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    expect(await adapter.readBalance(`${TOKEN}:${TEAM_ID}`)).toEqual({
      ok: true,
      balances: [READING],
    })
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, expect.anything())
  })

  it("percent-encodes the team id in the path", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    await adapter.readBalance(
      JSON.stringify({ api_token: TOKEN, team_id: "1/../me" })
    )
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.thecompaniesapi.com/v2/teams/1%2F..%2Fme",
      expect.anything()
    )
  })

  it("asks for both values when one is missing or blank", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    for (const secret of [
      JSON.stringify({ api_token: TOKEN }),
      JSON.stringify({ api_token: " ", team_id: TEAM_ID }),
      TOKEN,
      `:${TEAM_ID}`,
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "The Companies API needs an API token and team ID.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a bad token on 401", async () => {
    // The API answered a dummy token with this on 2026-10-20.
    stubFetch(401, { message: "tokenNotFound" })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "The Companies API rejected this token.",
    })
  })

  it("points at the team ID on 403 and 404", async () => {
    // The OpenAPI spec documents 403 userNotInTeam and 404 teamNotFound.
    for (const status of [403, 404]) {
      stubFetch(status, { messages: "teamNotFound", status })
      expect(await adapter.readBalance(SECRET)).toEqual({
        ok: false,
        error: "The Companies API has no team with this ID for this token.",
      })
    }
  })

  it("reports the status on 429", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "The Companies API returned 429.",
    })
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(200, { ...REAL_RESPONSE, credits: 0 })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: true,
      balances: [{ ...READING, balance: 0 }],
    })
  })

  it("fails on a missing or non-numeric balance instead of reading 0", async () => {
    const { credits: _omit, ...rest } = REAL_RESPONSE
    for (const body of [
      rest,
      { ...REAL_RESPONSE, credits: null },
      { ...REAL_RESPONSE, credits: "lots" },
      null,
    ]) {
      stubFetch(200, body)
      expect(await adapter.readBalance(SECRET)).toEqual({
        ok: false,
        error: "The Companies API returned an unexpected response.",
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
      error: "The Companies API returned an unexpected response.",
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
    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach The Companies API.",
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})
