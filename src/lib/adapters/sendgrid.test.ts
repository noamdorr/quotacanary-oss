import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("sendgrid")

afterEach(() => vi.restoreAllMocks())

// Example GET /v3/user/credits response from the Twilio SendGrid docs (Users
// API -> Retrieve your credit balance).
const REAL_RESPONSE = {
  remain: 200,
  total: 200,
  overage: 0,
  used: 0,
  last_reset: "2013-01-01",
  next_reset: "2013-02-01",
  reset_frequency: "monthly",
}

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

describe("sendgrid adapter", () => {
  it("reads remaining emails of the plan total with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("SG.key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.sendgrid.com/v3/user/credits",
      expect.objectContaining({ headers: { Authorization: "Bearer SG.key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "emails",
          label: "Emails",
          balance: 200,
          balanceLimit: 200,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance("SG.key")).toEqual({
      ok: false,
      error: "SendGrid rejected this key.",
    })
  })

  it("rejects the key on 403", async () => {
    // Observed with a dummy key on 2026-10-17; a key without the
    // user.credits.read scope gets the same answer.
    stubFetch(403, { errors: [{ field: null, message: "access forbidden" }] })
    expect(await adapter.readBalance("SG.key")).toEqual({
      ok: false,
      error: "SendGrid rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("SG.key")).toEqual({
      ok: false,
      error: "SendGrid returned 429.",
    })
  })

  it("fails on a body without remain", async () => {
    stubFetch(200, { total: 200, used: 0 })
    expect(await adapter.readBalance("SG.key")).toEqual({
      ok: false,
      error: "SendGrid returned an unexpected response.",
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
    expect((await adapter.readBalance("SG.key")).ok).toBe(false)
  })
})
