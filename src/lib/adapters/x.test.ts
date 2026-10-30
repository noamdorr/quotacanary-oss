import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const adapter = catalogAdapterFor("x")
const KEY = "x-key"

afterEach(() => vi.restoreAllMocks())

// GET /2/usage/tweets, the docs example (docs.x.com/x-api/usage/get-usage).
// The cap and usage are numeric strings; both engines coerce them. The
// prepaid USD credit balance is Console-only, so this is the Post read cap.
const REAL_RESPONSE = {
  data: {
    project_id: "1234567890",
    project_cap: "3000000",
    project_usage: "1250000",
    cap_reset_day: 19,
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

describe("x adapter", () => {
  it("reads the balance with a Bearer header", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.x.com/2/usage/tweets?usage.fields=project_cap,project_usage,cap_reset_day",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer x-key",
        },
      })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "post_reads",
          label: "Post reads",
          balance: 1750000,
          balanceLimit: 3000000,
          unit: "credits",
        },
      ],
    })
  })

  it("rejects the key on 401", async () => {
    stubFetch(401, {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "X rejected this key.",
    })
  })

  it("fails on a body without the balance", async () => {
    stubFetch(200, {
      data: {
        project_id: "1234567890",
      },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "X returned an unexpected response.",
    })
  })
})
