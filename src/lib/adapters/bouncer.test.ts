import { afterEach, describe, expect, it, vi } from "vitest"
import { bouncerAdapter } from "./bouncer"

afterEach(() => vi.restoreAllMocks())

describe("bouncer adapter", () => {
  it("returns balance from credits field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ credits: 1234 }),
          }) as Response
      )
    )
    const result = await bouncerAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1234,
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
          ({ ok: false, status: 401, json: async () => ({}) }) as Response
      )
    )
    const result = await bouncerAdapter.readBalance("key")
    expect(result).toEqual({ ok: false, error: "Bouncer rejected this key." })
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
    const result = await bouncerAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
