import { afterEach, describe, expect, it, vi } from "vitest"
import { emailableAdapter } from "./emailable"

afterEach(() => vi.restoreAllMocks())

describe("emailable adapter", () => {
  it("returns balance from available_credits field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ available_credits: 1234 }),
          }) as Response
      )
    )
    const result = await emailableAdapter.readBalance("key")
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
    const result = await emailableAdapter.readBalance("key")
    expect(result).toEqual({ ok: false, error: "Emailable rejected this key." })
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
    const result = await emailableAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
