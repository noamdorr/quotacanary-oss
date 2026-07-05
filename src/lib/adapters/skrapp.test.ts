import { afterEach, describe, expect, it, vi } from "vitest"
import { skrappAdapter } from "./skrapp"

afterEach(() => vi.restoreAllMocks())

describe("skrapp adapter", () => {
  it("returns remaining email credits from account quota and usage", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            credit: {
              email: {
                quota: 10000,
                used: 4991,
              },
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await skrappAdapter.readBalance("skrapp-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.skrapp.io/api/v2/account",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Access-Key": "skrapp-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "email",
          label: "Email Credits",
          balance: 5009,
          balanceLimit: 10000,
          unit: "credits",
        },
      ],
    })
  })

  it("coerces numeric strings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              credit: {
                email: {
                  quota: "500",
                  used: "125",
                },
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await skrappAdapter.readBalance("skrapp-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "email",
          label: "Email Credits",
          balance: 375,
          balanceLimit: 500,
          unit: "credits",
        },
      ],
    })
  })

  it("returns an auth error on 403", async () => {
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

    const result = await skrappAdapter.readBalance("bad-key")

    expect(result).toEqual({
      ok: false,
      error: "Skrapp rejected this key.",
    })
  })

  it("returns vendor-level errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              status_code: 402,
              message: "API features are only available to paid accounts",
            }),
          }) as unknown as Response
      )
    )

    const result = await skrappAdapter.readBalance("free-key")

    expect(result).toEqual({
      ok: false,
      error: "API features are only available to paid accounts",
    })
  })

  it("returns an error on non-JSON responses", async () => {
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

    const result = await skrappAdapter.readBalance("skrapp-key")

    expect(result).toEqual({
      ok: false,
      error: "Skrapp returned an unexpected response.",
    })
  })

  it("returns an error when quota fields are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              credit: {
                email: {
                  quota: 100,
                },
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await skrappAdapter.readBalance("skrapp-key")

    expect(result).toEqual({
      ok: false,
      error: "Skrapp returned an unexpected response.",
    })
  })

  it("returns an error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      })
    )

    const result = await skrappAdapter.readBalance("skrapp-key")

    expect(result).toEqual({ ok: false, error: "Couldn't reach Skrapp." })
  })
})
