import { afterEach, describe, expect, it, vi } from "vitest"
import { findymailAdapter } from "./findymail"

afterEach(() => vi.restoreAllMocks())

describe("findymail adapter", () => {
  it("returns balance from credits field with null balanceLimit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ credits: 1234 }),
          }) as unknown as Response
      )
    )
    const result = await findymailAdapter.readBalance("key")
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
          ({
            ok: false,
            status: 401,
            json: async () => ({}),
          }) as unknown as Response
      )
    )
    const result = await findymailAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Findymail rejected this key."
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
    const result = await findymailAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
