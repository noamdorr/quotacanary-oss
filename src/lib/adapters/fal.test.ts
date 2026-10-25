import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("fal")

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/account/billing?expand=credits response from the fal
// Platform API docs (Account -> Billing).
const REAL_RESPONSE = {
  username: "my-team",
  credits: {
    current_balance: 24.5,
    currency: "USD",
  },
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

describe("fal adapter", () => {
  it("reads the dollar credit balance with a Key authorization header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("fal_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fal.ai/v1/account/billing?expand=credits",
      expect.objectContaining({ headers: { Authorization: "Key fal_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 24.5,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(401, {
      error: {
        type: "authorization_error",
        message: "Invalid API key or malformed Authorization header",
      },
    })
    expect(await adapter.readBalance("fal_key")).toEqual({
      ok: false,
      error: "fal.ai rejected this key.",
    })
  })

  it("rejects a key without billing:usage:read on 403", async () => {
    stubFetch(403, {
      error: { type: "authorization_error", message: "Access denied" },
    })
    expect(await adapter.readBalance("fal_key")).toEqual({
      ok: false,
      error: "fal.ai rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {
      error: { type: "rate_limited", message: "Rate limit exceeded" },
    })
    expect(await adapter.readBalance("fal_key")).toEqual({
      ok: false,
      error: "fal.ai returned 429.",
    })
  })

  it("fails on a body without the credits block", async () => {
    stubFetch(200, { username: "my-team" })
    expect(await adapter.readBalance("fal_key")).toEqual({
      ok: false,
      error: "fal.ai returned an unexpected response.",
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
    expect((await adapter.readBalance("fal_key")).ok).toBe(false)
  })
})
