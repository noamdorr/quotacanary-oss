import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("elevenlabs")

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/user/subscription response from the ElevenLabs API
// reference (User -> Get user subscription), trimmed to the fields around the
// character quota; the docs example also lists invoices and voice slots.
const REAL_RESPONSE = {
  tier: "starter",
  character_count: 1000,
  character_limit: 10000,
  max_character_limit_extension: 10000,
  max_credit_limit_extension: 10000,
  can_extend_character_limit: true,
  voice_slots_used: 1,
  voice_limit: 10,
  current_overage: { amount: "0", currency: "usd" },
  status: "active",
  next_character_count_reset_unix: 1738356858,
  currency: "usd",
  billing_period: "monthly_period",
  character_refresh_period: "monthly_period",
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

describe("elevenlabs adapter", () => {
  it("reads characters left of the limit with the xi-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("el_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/user/subscription",
      expect.objectContaining({ headers: { "xi-api-key": "el_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "characters",
          label: "Characters",
          balance: 9000,
          balanceLimit: 10000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17.
    stubFetch(401, {
      detail: {
        type: "authentication_error",
        code: "unauthorized",
        message: "Invalid API key",
        status: "invalid_api_key",
      },
    })
    expect(await adapter.readBalance("el_key")).toEqual({
      ok: false,
      error: "ElevenLabs rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("el_key")).toEqual({
      ok: false,
      error: "ElevenLabs returned 429.",
    })
  })

  it("fails on a body without character_limit", async () => {
    stubFetch(200, { tier: "starter", character_count: 1000 })
    expect(await adapter.readBalance("el_key")).toEqual({
      ok: false,
      error: "ElevenLabs returned an unexpected response.",
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
    expect((await adapter.readBalance("el_key")).ok).toBe(false)
  })
})
