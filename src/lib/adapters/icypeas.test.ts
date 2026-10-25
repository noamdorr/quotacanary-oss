import { afterEach, describe, expect, it, vi } from "vitest"
import { icypeasAdapter as adapter } from "./icypeas"

const KEY = "icypeas-api-key"
const EMAIL = "owner@example.com"
const SECRET = JSON.stringify({ api_key: KEY, email: EMAIL })
const ENDPOINT =
  "https://app.icypeas.com/api/a/actions/subscription-information"

afterEach(() => vi.restoreAllMocks())

// The 200 example from the subscription-information page's content chunk on
// https://api-doc.icypeas.com (docs 1.15.0, fetched 2026-10-20). The rendered
// page does not show it; `credits` is the only credit field.
const REAL_RESPONSE = {
  userId: "ax782432ezeze89087",
  customerId: "cus_NUigN0lSe4hOh9",
  currency: "eur",
  checkoutSession: "https://checkout.stripe.com/c/pay/cs_test_a1ekmO20jcb",
  lastInvoiceUrl: "",
  priceId: "price_1JPMUiIEPTjHbN3mQjFJqD46",
  plan: "Basic Plan",
  status: "paid",
  credits: 24,
  quotas: { daily: 1000 },
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
  balance: 24,
  balanceLimit: null,
  unit: "credits",
}

describe("Icypeas adapter", () => {
  it("posts the account email with the raw key as Authorization", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(SECRET)
    expect(fetchMock).toHaveBeenCalledWith(
      ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: KEY,
        },
        body: JSON.stringify({ email: EMAIL }),
      })
    )
    expect(result).toEqual({ ok: true, balances: [READING] })
  })

  it("accepts the first:second compatibility form", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    expect(await adapter.readBalance(`${KEY}:${EMAIL}`)).toEqual({
      ok: true,
      balances: [READING],
    })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ email: EMAIL })
  })

  it("asks for both values when one is missing or blank", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    for (const secret of [
      JSON.stringify({ api_key: KEY }),
      JSON.stringify({ api_key: KEY, email: "" }),
      KEY,
      `:${EMAIL}`,
    ]) {
      expect(await adapter.readBalance(secret)).toEqual({
        ok: false,
        error: "Icypeas needs an API key and the account email.",
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a bad key on 401", async () => {
    // Icypeas answered a dummy key with this on 2026-10-20.
    stubFetch(401, {
      message: "The user does not exist",
      error: "UserNotFoundError",
      status: 401,
      code: "user_not_found_error",
    })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Icypeas rejected this API key.",
    })
  })

  it("rejects a bad key on 403", async () => {
    stubFetch(403)
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Icypeas rejected this API key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {
      message: "You have exceeded the max number of requests per minute.",
      error: "RateLimitExceededError",
      status: 429,
      code: "rate_limit_exceeded_error",
    })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Icypeas returned 429.",
    })
  })

  it("reports a validation failure, which arrives as a 200", async () => {
    // The documented validation error shape for this route.
    stubFetch(200, {
      validationErrors: [
        {
          expected: "email",
          type: "stringEmpty",
          actual: "",
          field: "email",
          message: "validation_string_empty",
        },
      ],
      success: false,
    })
    expect(await adapter.readBalance(SECRET)).toEqual({
      ok: false,
      error: "Icypeas did not accept this account email.",
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
        error: "Icypeas returned an unexpected response.",
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
      error: "Icypeas returned an unexpected response.",
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
    expect(result).toEqual({ ok: false, error: "Couldn't reach Icypeas." })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })
})
