import { afterEach, describe, expect, it, vi } from "vitest"
import { surfeAdapter } from "./surfe"

afterEach(() => vi.restoreAllMocks())

describe("surfe adapter", () => {
  it("returns three readings for email, mobile, and search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              totalEmail: 100,
              totalMobile: 200,
              totalSearch: 300,
            }),
          }) as unknown as Response
      )
    )
    const result = await surfeAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "email",
          label: "Email Credits",
          balance: 100,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "mobile",
          label: "Mobile Credits",
          balance: 200,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "search",
          label: "Search Credits",
          balance: 300,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })
  it("returns error on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 401,
            json: async () => ({}),
          }) as unknown as Response
      )
    )
    const result = await surfeAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Surfe rejected this key."
    )
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
    const result = await surfeAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
