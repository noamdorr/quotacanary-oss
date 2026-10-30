import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("datagma")
const KEY = "datagma-key"

afterEach(() => vi.restoreAllMocks())

// GET /api/ingress/v1/mine, from the vendor spec (datagmaapi.readme.io,
// IngressService_GetCredit). currentCredit is an int64 typed as a string
// (protobuf JSON style); both engines coerce numeric strings. Open point:
// confirm the field and its type with one live read.
const REAL_RESPONSE = {
  email: "user@example.com",
  apiId: "datagma-key",
  currentCredit: "4250",
  plan: "Pro",
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

describe("datagma adapter", () => {
  it("reads the balance with the key in the apiId query parameter", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.datagma.net/api/ingress/v1/mine?apiId=datagma-key",
      expect.anything()
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 4250,
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
      error: "Datagma rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      email: "user@example.com",
      plan: "Pro",
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Datagma returned an unexpected response.",
    })
  })
})
