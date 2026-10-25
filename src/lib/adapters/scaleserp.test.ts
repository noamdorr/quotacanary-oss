import { afterEach, describe, expect, it, vi } from "vitest"
import { getAdapter } from "./registry"
import type { ToolAdapter } from "./types"

function adapter(): ToolAdapter {
  const found = getAdapter("scaleserp")
  if (!found) throw new Error("Scale SERP adapter is not registered")
  return found
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("scaleserp adapter", () => {
  it("returns credits remaining and limit from account_info", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            request_info: { success: true },
            account_info: {
              credits_remaining: 14885,
              credits_limit: 15000,
            },
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await adapter().readBalance("key with spaces")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.scaleserp.com/account?api_key=key%20with%20spaces",
      expect.any(Object)
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 14885,
          balanceLimit: 15000,
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

    const result = await adapter().readBalance("key")

    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Scale SERP rejected this key."
    )
  })

  it("returns an error on a vendor-level failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              request_info: { success: false },
            }),
          }) as unknown as Response
      )
    )

    const result = await adapter().readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Scale SERP rejected this key.",
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

    const result = await adapter().readBalance("key")

    expect(result.ok).toBe(false)
  })

  it("returns an error when credits are missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              request_info: { success: true },
              account_info: { credits_limit: 15000 },
            }),
          }) as unknown as Response
      )
    )

    const result = await adapter().readBalance("key")

    expect(result).toEqual({
      ok: false,
      error: "Scale SERP returned an unexpected response.",
    })
  })
})

describe("scaleserp response boundaries", () => {
  it.each([null, undefined, "", "invalid", Number.POSITIVE_INFINITY])(
    "rejects invalid balance %s",
    async (value) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ account_info: { credits_remaining: value } }),
        })
      )
      expect((await adapter().readBalance("key")).ok).toBe(false)
    }
  )
  it.each([0, "0"])("preserves zero balance %s", async (value) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ account_info: { credits_remaining: value } }),
      })
    )
    expect(await adapter().readBalance("key")).toMatchObject({
      ok: true,
      balances: [{ balance: 0 }],
    })
  })
  it("rejects a null JSON body without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => null })
    )
    expect((await adapter().readBalance("key")).ok).toBe(false)
  })
  it.each([403, 429, 500])("handles HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }))
    expect((await adapter().readBalance("key")).ok).toBe(false)
  })
  it("handles a network failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect((await adapter().readBalance("key")).ok).toBe(false)
  })
})
