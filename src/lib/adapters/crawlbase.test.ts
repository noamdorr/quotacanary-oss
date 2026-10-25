import { afterEach, describe, expect, it, vi } from "vitest"
import { getAdapter } from "./registry"

function adapter() {
  const found = getAdapter("crawlbase")
  if (!found) throw new Error("Crawlbase adapter is not registered")
  return found
}

const credentials = JSON.stringify({
  token: "crawlbase-token",
  product: "crawling-api",
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("crawlbase adapter", () => {
  it("reads remaining credits for the selected Crawlbase product", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            totalSuccess: 1200,
            totalFailed: 50,
            totalDue: 12,
            remainingCredits: "8800",
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const adapter = getAdapter("crawlbase")
    const result = adapter ? await adapter.readBalance(credentials) : undefined

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.crawlbase.com/account?token=crawlbase-token&product=crawling-api",
      expect.any(Object)
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Crawling API Credits",
          balance: 8800,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("returns an error when the credential payload is missing a field", async () => {
    const adapter = getAdapter("crawlbase")
    const result = adapter
      ? await adapter.readBalance(JSON.stringify({ token: "crawlbase-token" }))
      : undefined

    expect(result).toEqual({
      ok: false,
      error: "Crawlbase needs a token and product slug.",
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

    const adapter = getAdapter("crawlbase")
    const result = adapter ? await adapter.readBalance(credentials) : undefined

    expect(result).toEqual({
      ok: false,
      error: "Crawlbase rejected these credentials.",
    })
  })

  it("returns an error when remaining credits are not present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ totalSuccess: 1200 }),
          }) as unknown as Response
      )
    )

    const adapter = getAdapter("crawlbase")
    const result = adapter ? await adapter.readBalance(credentials) : undefined

    expect(result).toEqual({
      ok: false,
      error: "Crawlbase returned an unexpected response.",
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

    const adapter = getAdapter("crawlbase")
    const result = adapter ? await adapter.readBalance(credentials) : undefined

    expect(result?.ok).toBe(false)
  })
})

describe("crawlbase response boundaries", () => {
  it.each([null, undefined, "", "invalid", Number.POSITIVE_INFINITY])(
    "rejects invalid balance %s",
    async (value) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ remainingCredits: value }),
        })
      )
      expect((await adapter().readBalance(credentials)).ok).toBe(false)
    }
  )
  it.each([0, "0"])("preserves zero balance %s", async (value) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ remainingCredits: value }),
      })
    )
    expect(await adapter().readBalance(credentials)).toMatchObject({
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
    expect((await adapter().readBalance(credentials)).ok).toBe(false)
  })
  it.each([403, 429, 500])("handles HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }))
    expect((await adapter().readBalance(credentials)).ok).toBe(false)
  })
  it("handles a network failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect((await adapter().readBalance(credentials)).ok).toBe(false)
  })
})

describe("crawlbase credential validation", () => {
  it.each(["__proto__", "constructor", "toString", "unknown", ""])(
    "rejects unsupported product %s before fetching",
    async (product) => {
      const fetchMock = vi.fn()
      vi.stubGlobal("fetch", fetchMock)
      expect(
        await adapter().readBalance(JSON.stringify({ token: "token", product }))
      ).toMatchObject({ ok: false })
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )
})
