import { afterEach, describe, expect, it, vi } from "vitest"
import { zerobounceAdapter } from "./zerobounce"

afterEach(() => vi.restoreAllMocks())

describe("zerobounce adapter", () => {
  it("returns balance from Credits field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ Credits: 1500 }),
          }) as Response
      )
    )
    const result = await zerobounceAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 1500,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns error when Credits is -1 (bad key quirk)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ Credits: -1 }),
          }) as Response
      )
    )
    const result = await zerobounceAdapter.readBalance("bad-key")
    expect(result).toEqual({
      ok: false,
      error: "ZeroBounce rejected this key.",
    })
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
    const result = await zerobounceAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
