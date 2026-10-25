import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("cloro")

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/credits response from the cloro docs (Get credit balance).
// perCycle and cycleResetsAt are null on a free-tier organization.
const REAL_RESPONSE = {
  remaining: 48210,
  perCycle: 1562500,
  cycleResetsAt: "2026-08-10T17:35:27.000Z",
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

describe("cloro adapter", () => {
  it("reads remaining credits and the per-cycle grant with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("cl_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloro.dev/v1/credits",
      expect.objectContaining({ headers: { Authorization: "Bearer cl_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 48210,
          balanceLimit: 1562500,
          unit: "credits",
        },
      ],
    })
  })

  it("reports no limit on a free-tier organization", async () => {
    stubFetch(200, { remaining: 500, perCycle: null, cycleResetsAt: null })
    expect(await adapter.readBalance("cl_key")).toMatchObject({
      ok: true,
      balances: [{ balance: 500, balanceLimit: null }],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {
      success: false,
      error: {
        code: "INVALID_OR_EXPIRED_API_KEY",
        message: "Missing or invalid API key",
      },
    })
    expect(await adapter.readBalance("cl_key")).toEqual({
      ok: false,
      error: "cloro rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "API key rate limit exceeded",
      },
    })
    expect(await adapter.readBalance("cl_key")).toEqual({
      ok: false,
      error: "cloro returned 429.",
    })
  })

  it("fails on a body without remaining", async () => {
    stubFetch(200, { perCycle: 37500 })
    expect(await adapter.readBalance("cl_key")).toEqual({
      ok: false,
      error: "cloro returned an unexpected response.",
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
    expect((await adapter.readBalance("cl_key")).ok).toBe(false)
  })
})
