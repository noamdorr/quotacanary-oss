import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("serpstat")

afterEach(() => vi.restoreAllMocks())

// Example SerpstatLimitsProcedure.getStats response from the Serpstat API docs
// (Credits API -> getStats). The docs sample has left_lines above max_lines;
// both are passed through as-is.
const REAL_RESPONSE = {
  id: "123",
  result: {
    data: {
      max_lines: 100000,
      used_lines: 5,
      left_lines: 999995,
      user_info: {
        user_id: "555",
        ga_client_Id: "12434534.544545",
        plan_id: "2028",
      },
      plugin_limits: {
        hasApiPlugin: true,
        delayBetweenRequests: 1,
        total: 10000,
        used: 10,
        left: 9990,
      },
    },
    summary_info: { left_lines: 999995 },
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

describe("serpstat adapter", () => {
  it("posts the getStats JSON-RPC call with the token query parameter", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("tok/en")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.serpstat.com/v4/?token=tok%2Fen",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"id":"1","method":"SerpstatLimitsProcedure.getStats","params":{}}',
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "API credits",
          balance: 999995,
          balanceLimit: 100000,
          unit: "credits",
        },
      ],
    })
  })

  // Serpstat answers a bad token with HTTP 200 and a JSON-RPC error
  // (observed 2026-10-17 with a dummy token).
  it("passes the JSON-RPC error through on an invalid token", async () => {
    stubFetch(200, {
      id: "1",
      error: { code: -32020, message: "Invalid token!", data: {} },
    })
    expect(await adapter.readBalance("bad")).toEqual({
      ok: false,
      error: "Invalid token!",
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance("bad")).toEqual({
      ok: false,
      error: "Serpstat rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("tok")).toEqual({
      ok: false,
      error: "Serpstat returned 429.",
    })
  })

  it("fails on a body without left_lines", async () => {
    stubFetch(200, { id: "1", result: { data: { max_lines: 100000 } } })
    expect(await adapter.readBalance("tok")).toEqual({
      ok: false,
      error: "Serpstat returned an unexpected response.",
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
    expect((await adapter.readBalance("tok")).ok).toBe(false)
  })
})
