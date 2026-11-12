import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("exa")
const KEY = "exa-service-key"

afterEach(() => vi.restoreAllMocks())

// GET /team-management/credits, the docs example
// (exa.ai/docs/reference/team-management/get-team-credits). Remaining prepaid
// credits in USD. Needs a service key from the Team Management API, which Exa
// enables per team; a normal search key gets a 401.
const REAL_RESPONSE = {
  credits_usd: 412.37,
  expiring_credits: [{ amount_usd: 20, expires_at: "2026-12-01T00:00:00Z" }],
  metadata: { generated_at: "2026-11-04T19:00:00Z" },
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

describe("exa adapter", () => {
  it("reads the USD balance with an x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://admin-api.exa.ai/team-management/credits",
      expect.objectContaining({
        headers: {
          "x-api-key": "exa-service-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: 412.37,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, { error: "Unauthorized" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Exa rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Exa returned an unexpected response.",
    })
  })
})
