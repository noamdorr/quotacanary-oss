import { afterEach, describe, expect, it, vi } from "vitest"
import { encodeSnovCredentials, snovAdapter } from "./snov"

afterEach(() => vi.restoreAllMocks())

describe("snov adapter", () => {
  it("exchanges client credentials and reads the credit balance", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "access-token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            balance: "25000.00",
          },
        }),
      } as unknown as Response)
    vi.stubGlobal("fetch", fetchMock)

    const result = await snovAdapter.readBalance(
      encodeSnovCredentials({
        clientId: "client-id",
        clientSecret: "client-secret",
      })
    )

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.snov.io/v1/oauth/access_token",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: "client-id",
          client_secret: "client-secret",
        }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.snov.io/v1/get-balance",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 25000,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns an error when the credential payload is missing a field", async () => {
    const result = await snovAdapter.readBalance(
      JSON.stringify({ clientId: "client-id" })
    )

    expect(result).toEqual({
      ok: false,
      error: "Snov.io needs a client ID and client secret.",
    })
  })

  it("returns error when token exchange is rejected", async () => {
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

    const result = await snovAdapter.readBalance(
      encodeSnovCredentials({
        clientId: "client-id",
        clientSecret: "client-secret",
      })
    )

    expect(result).toEqual({
      ok: false,
      error: "Snov.io rejected these credentials.",
    })
  })

  it("returns an error on a non-JSON balance body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ access_token: "access-token" }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("not json")
          },
        } as unknown as Response)
    )

    const result = await snovAdapter.readBalance(
      encodeSnovCredentials({
        clientId: "client-id",
        clientSecret: "client-secret",
      })
    )

    expect(result.ok).toBe(false)
  })
})
