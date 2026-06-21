import { afterEach, describe, expect, it, vi } from "vitest"
import { lushaAdapter } from "./lusha"

afterEach(() => vi.restoreAllMocks())

describe("lusha adapter", () => {
  it("returns balance=remaining and balanceLimit=total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              usage: { bulkCredits: { remaining: 400, total: 1000 } },
            }),
          }) as unknown as Response
      )
    )
    const result = await lushaAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 400,
          balanceLimit: 1000,
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
    const result = await lushaAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Lusha rejected this key."
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
    const result = await lushaAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
