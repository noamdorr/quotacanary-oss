import { afterEach, describe, expect, it, vi } from "vitest"
import { neverbounceAdapter } from "./neverbounce"

afterEach(() => vi.restoreAllMocks())

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => body }) as Response)
  )
}

describe("neverbounce adapter", () => {
  it("parses paid credits remaining on success", async () => {
    mockFetch({
      status: "success",
      credits_info: { paid_credits_remaining: 4200 },
    })
    const result = await neverbounceAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "paid_credits",
          label: "Paid Credits",
          balance: 4200,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns an error on auth_failure", async () => {
    mockFetch({ status: "auth_failure", message: "bad key" })
    const result = await neverbounceAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })

  it("returns an error on non-ok HTTP status", async () => {
    mockFetch({}, false, 500)
    const result = await neverbounceAdapter.readBalance("key")
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
    const result = await neverbounceAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })

  it("returns an error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom")
      })
    )
    const result = await neverbounceAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
