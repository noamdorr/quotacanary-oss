import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const prospeoAdapter = catalogAdapterFor("prospeo")

afterEach(() => vi.restoreAllMocks())

describe("prospeo adapter", () => {
  it("returns balance=remaining and balanceLimit=remaining+used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              error: false,
              response: { remaining_credits: 900, used_credits: 100 },
            }),
          }) as unknown as Response
      )
    )
    const result = await prospeoAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 900,
          balanceLimit: 1000,
          unit: "credits",
        },
      ],
    })
  })

  it("returns error when error envelope is true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ error: true, response: {} }),
          }) as unknown as Response
      )
    )
    const result = await prospeoAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Prospeo rejected this key."
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
    const result = await prospeoAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })

  it("reads a 400 INVALID_API_KEY as a rejected key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 400,
            json: async () => ({ error: true, error_code: "INVALID_API_KEY" }),
          }) as unknown as Response
      )
    )
    const result = await prospeoAdapter.readBalance("key")
    expect(result).toEqual({ ok: false, error: "Prospeo rejected this key." })
  })

  it("shows Prospeo's own code for any other 400", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 400,
            json: async () => ({ error: true, error_code: "INVALID_REQUEST" }),
          }) as unknown as Response
      )
    )
    const result = await prospeoAdapter.readBalance("key")
    expect(result).toEqual({ ok: false, error: "INVALID_REQUEST" })
  })

  it("falls back to the status when a 400 carries no Prospeo envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 400,
            json: async () => ({}),
          }) as unknown as Response
      )
    )
    const result = await prospeoAdapter.readBalance("key")
    expect(result).toEqual({ ok: false, error: "Prospeo returned 400." })
  })
})
