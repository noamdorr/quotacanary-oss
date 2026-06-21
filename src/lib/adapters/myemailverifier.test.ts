import { afterEach, describe, expect, it, vi } from "vitest"
import { myemailverifierAdapter } from "./myemailverifier"

afterEach(() => vi.restoreAllMocks())

describe("myemailverifier adapter", () => {
  it("reads the capital-C Credits field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ Credits: "7800" }),
          }) as unknown as Response
      )
    )
    const result = await myemailverifierAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 7800,
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
    const result = await myemailverifierAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
