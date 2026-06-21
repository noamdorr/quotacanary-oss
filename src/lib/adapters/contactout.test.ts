import { afterEach, describe, expect, it, vi } from "vitest"
import { contactoutAdapter } from "./contactout"

afterEach(() => vi.restoreAllMocks())

describe("contactout adapter", () => {
  it("reads monthly email, phone, and search credit pools", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            status_code: 200,
            usage: {
              count: 100,
              quota: 200,
              remaining: 100,
              phone_count: 500,
              phone_quota: 1000,
              phone_remaining: 500,
              search_count: 25,
              search_quota: 300,
              search_remaining: 275,
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await contactoutAdapter.readBalance("api-token")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.contactout.com/v1/stats",
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authorization: "basic",
          token: "api-token",
        },
      }
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "email",
          label: "Email Credits",
          balance: 100,
          balanceLimit: 200,
          unit: "credits",
        },
        {
          creditType: "phone",
          label: "Phone Credits",
          balance: 500,
          balanceLimit: 1000,
          unit: "credits",
        },
        {
          creditType: "search",
          label: "Search Credits",
          balance: 275,
          balanceLimit: 300,
          unit: "credits",
        },
      ],
    })
  })

  it("treats prepaid quota fields as remaining balances", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              status_code: 200,
              usage: {
                quota: 200,
                phone_quota: 1000,
                search_quota: 300,
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await contactoutAdapter.readBalance("api-token")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "email",
          label: "Email Credits",
          balance: 200,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "phone",
          label: "Phone Credits",
          balance: 1000,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "search",
          label: "Search Credits",
          balance: 300,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns error on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 403,
            json: async () => ({}),
          }) as unknown as Response
      )
    )

    const result = await contactoutAdapter.readBalance("api-token")

    expect(result).toEqual({
      ok: false,
      error: "ContactOut rejected this token.",
    })
  })
})
