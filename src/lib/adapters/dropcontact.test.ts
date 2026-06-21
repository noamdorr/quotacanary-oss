import { afterEach, describe, expect, it, vi } from "vitest"
import { dropcontactAdapter } from "./dropcontact"

afterEach(() => vi.restoreAllMocks())

describe("dropcontact adapter", () => {
  it("returns balance=credits_left and balanceLimit=null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ credits_left: 250 }),
          }) as unknown as Response
      )
    )
    const result = await dropcontactAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 250,
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
    const result = await dropcontactAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Dropcontact rejected this key."
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
    const result = await dropcontactAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
})
