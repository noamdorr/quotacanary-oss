import { afterEach, describe, expect, it, vi } from "vitest"
import { openrouterAdapter } from "./openrouter"

afterEach(() => vi.restoreAllMocks())

describe("openrouter adapter", () => {
  it("computes remaining = total_credits - total_usage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              data: { total_credits: 20, total_usage: 7.5 },
            }),
          }) as Response
      )
    )
    const result = await openrouterAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 12.5,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("returns error on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: false, status: 401, json: async () => ({}) }) as Response
      )
    )
    expect((await openrouterAdapter.readBalance("key")).ok).toBe(false)
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
    const result = await openrouterAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
