import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("clay")

afterEach(() => vi.restoreAllMocks())

// GET /public/v0/credits/balance response built from the Clay Public API
// OpenAPI schema (Credits -> Get workspace credit balances); the docs give the
// schema but no example values.
const REAL_RESPONSE = {
  balance: 18450,
  action_execution_balance: 41200,
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

describe("clay adapter", () => {
  it("reads data credits and actions with the clay-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("clay_key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.clay.com/public/v0/credits/balance",
      expect.objectContaining({ headers: { "clay-api-key": "clay_key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Data credits",
          balance: 18450,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "actions",
          label: "Actions",
          balance: 41200,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("reads data credits alone on a legacy plan without actions", async () => {
    stubFetch(200, { balance: 0 })
    expect(await adapter.readBalance("clay_key")).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Data credits",
          balance: 0,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, { message: "Authentication required" })
    expect(await adapter.readBalance("clay_key")).toEqual({
      ok: false,
      error: "Clay rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, { message: "Too many requests" })
    expect(await adapter.readBalance("clay_key")).toEqual({
      ok: false,
      error: "Clay returned 429.",
    })
  })

  it("fails on a body without either balance", async () => {
    stubFetch(200, { workspace_id: 123 })
    expect(await adapter.readBalance("clay_key")).toEqual({
      ok: false,
      error: "Clay returned an unexpected response.",
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
    expect((await adapter.readBalance("clay_key")).ok).toBe(false)
  })
})
