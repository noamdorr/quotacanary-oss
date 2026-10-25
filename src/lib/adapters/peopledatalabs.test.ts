import { afterEach, describe, expect, it, vi } from "vitest"
import { peopledatalabsAdapter as adapter } from "./peopledatalabs"

const KEY = "pdl-key"

afterEach(() => vi.restoreAllMocks())

// The "Sample Response Headers" example on
// https://docs.peopledatalabs.com/docs/usage-limits (the ratelimit objects
// are left out; the adapter never reads them).
const DOCS_HEADERS = {
  "x-call-credits-spent": "1",
  "x-call-credits-type": "enrich",
  "x-ratelimit-reset": "2022-02-23T20:19:55Z",
  "x-lifetime-used": "984152",
  "x-totallimit-remaining": "1342",
  "x-totallimit-purchased-remaining": "342",
  "x-totallimit-overages-remaining": "1000",
}

const CREDITS = (balance: number) => ({
  ok: true,
  balances: [
    {
      creditType: "credits",
      label: "Credits",
      balance,
      balanceLimit: null,
      unit: "credits",
    },
  ],
})

function stubFetch(status: number, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(headers),
      }) as unknown as Response
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("People Data Labs adapter", () => {
  it("reads x-totallimit-remaining from a parameterless HEAD", async () => {
    const fetchMock = stubFetch(400, DOCS_HEADERS)
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.peopledatalabs.com/v5/person/enrich",
      expect.objectContaining({
        method: "HEAD",
        headers: { "X-Api-Key": KEY, Accept: "application/json" },
      })
    )
    expect(result).toEqual(CREDITS(1342))
  })

  it("reads the header on a 200 too", async () => {
    stubFetch(200, DOCS_HEADERS)
    expect(await adapter.readBalance(KEY)).toEqual(CREDITS(1342))
  })

  it("ignores the purchased and overages split", async () => {
    stubFetch(404, {
      "x-totallimit-remaining": "7",
      "x-totallimit-purchased-remaining": "999",
      "x-totallimit-overages-remaining": "888",
    })
    expect(await adapter.readBalance(KEY)).toEqual(CREDITS(7))
  })

  it("keeps a spent balance as a real zero", async () => {
    stubFetch(402, { "x-totallimit-remaining": "0" })
    expect(await adapter.readBalance(KEY)).toEqual(CREDITS(0))
  })

  it("rejects a bad key on 401 and 403, even with the header", async () => {
    // 401 with no x-* headers observed with a dummy key on 2026-10-17.
    stubFetch(401)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "People Data Labs rejected this key.",
    })
    stubFetch(403, DOCS_HEADERS)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "People Data Labs rejected this key.",
    })
  })

  it("reports 429 without the header", async () => {
    stubFetch(429)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "People Data Labs returned 429.",
    })
  })

  it("reports any other status without the header", async () => {
    stubFetch(500)
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "People Data Labs returned 500.",
    })
  })

  it("fails on a 200 without the header instead of reading 0", async () => {
    stubFetch(200, { "x-call-credits-type": "enrich" })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "People Data Labs returned an unexpected response.",
    })
  })

  it("fails on a non-numeric header", async () => {
    for (const value of ["lots", "", "NaN"]) {
      stubFetch(200, { "x-totallimit-remaining": value })
      expect(await adapter.readBalance(KEY)).toEqual({
        ok: false,
        error: "People Data Labs returned an unexpected response.",
      })
    }
  })

  it("reports an unreachable host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network")
      })
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach People Data Labs.",
    })
  })
})
