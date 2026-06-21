import { afterEach, describe, expect, it, vi } from "vitest"
import { millionverifierAdapter } from "./millionverifier"

afterEach(() => vi.restoreAllMocks())

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => body }) as Response)
  )
}

describe("millionverifier adapter", () => {
  it("parses credits from the real response shape (ignores sibling fields)", async () => {
    // Real GET /api/v3/credits response, captured live 2026-05-29.
    mockFetch({
      credits: 21023,
      bulk_credits: 21023,
      renewing_credits: 0,
      plan: 4,
    })
    const result = await millionverifierAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 21023,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns error when body has error field", async () => {
    mockFetch({ error: "Invalid API key" })
    expect((await millionverifierAdapter.readBalance("key")).ok).toBe(false)
  })

  it("returns an error on non-ok HTTP status", async () => {
    mockFetch({}, false, 500)
    const result = await millionverifierAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })

  it("returns an error on a non-JSON body", async () => {
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
    const result = await millionverifierAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
