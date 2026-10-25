import { afterEach, describe, expect, it, vi } from "vitest"
import { catalogAdapterFor } from "./catalog"

const shodanAdapter = catalogAdapterFor("shodan")

afterEach(() => vi.restoreAllMocks())

describe("shodan adapter", () => {
  it("reads query and scan credit balances with documented caps", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            scan_credits: 5000,
            usage_limits: {
              scan_credits: 10000,
              query_credits: 200,
              monitored_ips: -1,
            },
            plan: "business",
            query_credits: 125,
            monitored_ips: 19,
          }),
        }) as unknown as Response
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await shodanAdapter.readBalance("api-key")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.shodan.io/api-info?key=api-key",
      expect.objectContaining({ headers: { Accept: "application/json" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "query",
          label: "Query Credits",
          balance: 125,
          balanceLimit: 200,
          unit: "credits",
        },
        {
          creditType: "scan",
          label: "Scan Credits",
          balance: 5000,
          balanceLimit: 10000,
          unit: "credits",
        },
      ],
    })
  })

  it("treats unlimited usage limits as uncapped balances", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              query_credits: 100000,
              scan_credits: 100000,
              usage_limits: {
                query_credits: -1,
                scan_credits: -1,
              },
            }),
          }) as unknown as Response
      )
    )

    const result = await shodanAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "query",
          label: "Query Credits",
          balance: 100000,
          balanceLimit: null,
          unit: "credits",
        },
        {
          creditType: "scan",
          label: "Scan Credits",
          balance: 100000,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  // Pinned at the catalog conversion (QUO-189). The hand-written adapter read a
  // null credit as a healthy 0 and a zero usage_limit as a 0 cap; the catalog
  // treats a null balance as missing and reports a cap only when it is above
  // zero. Vetoable: moving Shodan back to a hand-written adapter restores both.
  it("drops a pool whose credit is null and reports a zero cap as no cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              query_credits: null,
              scan_credits: 40,
              usage_limits: { query_credits: 100, scan_credits: 0 },
            }),
          }) as unknown as Response
      )
    )

    expect(await shodanAdapter.readBalance("api-key")).toEqual({
      ok: true,
      balances: [
        {
          creditType: "scan",
          label: "Scan Credits",
          balance: 40,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })

  it("reports an unexpected response when every credit is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ query_credits: null, scan_credits: null }),
          }) as unknown as Response
      )
    )

    expect(await shodanAdapter.readBalance("api-key")).toEqual({
      ok: false,
      error: "Shodan returned an unexpected response.",
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

    const result = await shodanAdapter.readBalance("api-key")

    expect(result).toEqual({
      ok: false,
      error: "Shodan rejected this key.",
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

    const result = await shodanAdapter.readBalance("api-key")

    expect(result.ok).toBe(false)
  })
})
