import { afterEach, describe, expect, it, vi } from "vitest"
import { mailercheckAdapter } from "./mailercheck"

afterEach(() => vi.restoreAllMocks())

describe("mailercheck adapter", () => {
  it("returns total credits", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ total: 999949 }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await mailercheckAdapter.readBalance("key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.mailercheck.com/api/credits",
      { headers: { Authorization: "Bearer key" } }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 999949,
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

    const result = await mailercheckAdapter.readBalance("key")

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "MailerCheck rejected this key."
    )
  })

  it("returns an error when MailerCheck cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )

    const result = await mailercheckAdapter.readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Couldn't reach MailerCheck.",
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

    const result = await mailercheckAdapter.readBalance("key")

    expect(result.ok).toBe(false)
  })
})
