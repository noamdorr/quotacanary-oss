import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("piapi")
const KEY = "piapi-key"

afterEach(() => vi.restoreAllMocks())

// GET /account/info. The docs name equivalent_in_usd ("the actually valid
// balance value in US dollar") but publish an empty 200 schema; the body below
// assumes PiAPI's usual {code, data, message} envelope. Open point: confirm
// the data. nesting with one live read.
const REAL_RESPONSE = {
  code: 200,
  data: {
    account_name: "Jane",
    credits: 1250000,
    equivalent_in_usd: 12.5,
  },
  message: "success",
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

describe("piapi adapter", () => {
  it("reads the balance with an x-api-key header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.piapi.ai/account/info",
      expect.objectContaining({
        headers: {
          "x-api-key": "piapi-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "wallet",
          label: "Balance",
          balance: 12.5,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "PiAPI rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      code: 200,
      data: {
        account_name: "Jane",
      },
      message: "success",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "PiAPI returned an unexpected response.",
    })
  })
})
