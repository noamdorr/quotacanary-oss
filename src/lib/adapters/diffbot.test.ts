import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { diffbotAdapter, diffbotCycleStart } from "./diffbot"
import { getAdapter } from "./registry"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-07-30T12:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Example GET /v4/account response (as captured in treg's catalog, which
// carries planCredits and planStart; the Diffbot docs list the same usage[]
// fields). The truncated usage days are filled in with the documented shape.
const REAL_RESPONSE = {
  planCredits: 10000,
  planStart: "2026-07-28",
  created: "2026-07-28",
  usage: [
    {
      date: "2026-07-28",
      subtitles: 0,
      nlp: 1,
      entities: 5,
      credits: 136,
      refresh: 0,
      proxies: 0,
      videos: 0,
      extractions: 10,
      facets: 0,
    },
    { date: "2026-07-29", credits: 258 },
    { date: "2026-07-30", credits: 6 },
  ],
  name: "REDACTED",
  plan: "kgfree",
  email: "person@example.com",
  token: "REDACTED",
  status: "active",
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

describe("diffbotCycleStart", () => {
  it("returns this month's anniversary once it has passed", () => {
    expect(diffbotCycleStart("2026-01-10", "2026-07-30")).toBe("2026-07-10")
  })

  it("falls back to last month's anniversary before it comes round", () => {
    expect(diffbotCycleStart("2026-01-28", "2026-07-05")).toBe("2026-06-28")
  })

  it("clamps a day-31 start to the month's last day", () => {
    expect(diffbotCycleStart("2026-01-31", "2026-03-15")).toBe("2026-02-28")
    expect(diffbotCycleStart("2026-01-31", "2026-04-30")).toBe("2026-04-30")
  })

  it("crosses a year boundary", () => {
    expect(diffbotCycleStart("2025-06-20", "2026-01-05")).toBe("2025-12-20")
  })

  it("starts on planStart in the first cycle", () => {
    expect(diffbotCycleStart("2026-07-28", "2026-07-30")).toBe("2026-07-28")
  })

  it("rejects a malformed date", () => {
    expect(diffbotCycleStart("July 28", "2026-07-30")).toBeNull()
  })
})

describe("diffbot adapter", () => {
  it("is registered as a hand-written adapter", () => {
    expect(getAdapter("diffbot")?.toolId).toBe("diffbot")
  })

  it("reads planCredits minus this cycle's usage with the token query param", async () => {
    const fetchMock = stubFetch(200, REAL_RESPONSE)
    const result = await diffbotAdapter.readBalance("db token")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.diffbot.com/v4/account?token=db%20token&days=31",
      expect.anything()
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Monthly credits",
          balance: 10000 - 136 - 258 - 6,
          balanceLimit: 10000,
          unit: "credits",
        },
      ],
    })
  })

  it("ignores usage from before the current cycle", async () => {
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"))
    stubFetch(200, {
      ...REAL_RESPONSE,
      usage: [
        { date: "2026-08-27", credits: 5000 },
        { date: "2026-08-28", credits: 100 },
        { date: "2026-09-01", credits: 50 },
      ],
    })
    expect(await diffbotAdapter.readBalance("db_token")).toMatchObject({
      ok: true,
      balances: [{ balance: 9850, balanceLimit: 10000 }],
    })
  })

  it("reads an empty usage array as nothing used", async () => {
    stubFetch(200, { ...REAL_RESPONSE, usage: [] })
    expect(await diffbotAdapter.readBalance("db_token")).toMatchObject({
      ok: true,
      balances: [{ balance: 10000 }],
    })
  })

  it.each([401, 403])("rejects the key on %s", async (status) => {
    stubFetch(status, { errorCode: 401, error: "Not authorized API token." })
    expect(await diffbotAdapter.readBalance("db_token")).toEqual({
      ok: false,
      error: "Diffbot rejected this key.",
    })
  })

  it("reports the status on 429", async () => {
    stubFetch(429, {})
    expect(await diffbotAdapter.readBalance("db_token")).toEqual({
      ok: false,
      error: "Diffbot returned 429.",
    })
  })

  it.each([
    ["planCredits", { ...REAL_RESPONSE, planCredits: undefined }],
    ["planStart", { ...REAL_RESPONSE, planStart: undefined }],
    ["usage", { ...REAL_RESPONSE, usage: undefined }],
  ])("fails without %s instead of guessing", async (_field, body) => {
    stubFetch(200, body)
    expect(await diffbotAdapter.readBalance("db_token")).toEqual({
      ok: false,
      error: "Diffbot returned an unexpected response.",
    })
  })

  it("fails on a non-JSON body", async () => {
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
    expect((await diffbotAdapter.readBalance("db_token")).ok).toBe(false)
  })

  it("handles a network failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    expect(await diffbotAdapter.readBalance("db_token")).toEqual({
      ok: false,
      error: "Couldn't reach Diffbot.",
    })
  })
})
