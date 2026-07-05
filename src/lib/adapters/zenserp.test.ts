import { afterEach, describe, expect, it, vi } from "vitest"
import { zenserpAdapter } from "./zenserp"
afterEach(() => vi.restoreAllMocks())
describe("zenserp adapter", () => {
  it("returns balance from remaining_requests", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ remaining_requests: 900 }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)
    const result = await zenserpAdapter.readBalance("key")
    // Zenserp authenticates via a bare `apikey` header, never the URL query string.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.zenserp.com/api/v2/status",
      expect.objectContaining({ headers: { apikey: "key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: 900,
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
    const result = await zenserpAdapter.readBalance("key")
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toBe(
      "Zenserp rejected this key."
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
    const result = await zenserpAdapter.readBalance("key")
    expect(result.ok).toBe(false)
  })
  it("treats a missing remaining_requests field as an unexpected response, not a zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ status: "ok" }),
          }) as unknown as Response
      )
    )
    const result = await zenserpAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "Zenserp returned an unexpected response.",
    })
  })
  it("treats an explicit null remaining_requests as an unexpected response, not a zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ remaining_requests: null }),
          }) as unknown as Response
      )
    )
    const result = await zenserpAdapter.readBalance("key")
    expect(result).toEqual({
      ok: false,
      error: "Zenserp returned an unexpected response.",
    })
  })
  it("records a present zero remaining_requests as a healthy zero balance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ remaining_requests: 0 }),
          }) as unknown as Response
      )
    )
    const result = await zenserpAdapter.readBalance("key")
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: 0,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })
})
