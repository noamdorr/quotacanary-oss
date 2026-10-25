import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("stability")

afterEach(() => vi.restoreAllMocks())

// Example GET /v1/user/balance response from the Stability AI API reference
// (User -> Account balance), read from the OpenAPI spec the docs page embeds.
const REAL_RESPONSE = {
  credits: 0.6336833840314097,
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

describe("stability adapter", () => {
  it("reads fractional credits with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance("sk-key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stability.ai/v1/user/balance",
      expect.objectContaining({ headers: { Authorization: "Bearer sk-key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 0.6336833840314097,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    // Observed with a dummy key on 2026-10-17 (the vendor echoes the key in
    // its message, which the interpreter never passes through).
    stubFetch(401, {
      id: "dfbf3432b780dc740ca7762eb3a9f36d",
      message: "Incorrect API key provided",
      name: "unauthorized",
    })
    expect(await adapter.readBalance("sk-key")).toEqual({
      ok: false,
      error: "Stability AI rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await adapter.readBalance("sk-key")).toEqual({
      ok: false,
      error: "Stability AI returned 429.",
    })
  })

  it("fails on a body without credits", async () => {
    stubFetch(200, { balance: 12 })
    expect(await adapter.readBalance("sk-key")).toEqual({
      ok: false,
      error: "Stability AI returned an unexpected response.",
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
    expect((await adapter.readBalance("sk-key")).ok).toBe(false)
  })
})
