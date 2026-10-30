import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("spidercloud")
const KEY = "spidercloud-key"

afterEach(() => vi.restoreAllMocks())

// GET /data/credits, the body from Spider's own SDK test fixture
// (spider-rs/spider-cloud-agent tests/fixtures/credits.json). 10,000 credits
// = $1; the value can be fractional.
const REAL_RESPONSE = {
  data: {
    credits: 125000.5,
  },
}

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      }) as unknown as Response
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("spidercloud adapter", () => {
  it("reads the balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.spider.cloud/data/credits",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer spidercloud-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 125000.5,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Spider rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      data: {},
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Spider returned an unexpected response.",
    })
  })
})
