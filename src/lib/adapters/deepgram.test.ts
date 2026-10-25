import { afterEach, describe, expect, it, vi } from "vitest"
import { DEEPGRAM_MAX_PROJECTS, deepgramAdapter as adapter } from "./deepgram"

const KEY = "dg-key"
const HEADERS = { Authorization: `Token ${KEY}`, Accept: "application/json" }
const LIST_URL = "https://api.deepgram.com/v1/projects"
const balancesUrl = (id: string) =>
  `https://api.deepgram.com/v1/projects/${id}/balances`

afterEach(() => vi.restoreAllMocks())

// Example responses from the API reference (fetched 2026-10-17):
// https://developers.deepgram.com/reference/manage/projects/list
const PROJECT = {
  project_id: "proj_9f8b7c6d5e4a3b2c1d0e",
  name: "Customer Support Transcriptions",
}
// https://developers.deepgram.com/reference/manage/billing/list (note the
// uppercase "USD": units are matched case-insensitively).
const DOCS_BALANCE = {
  balance_id: "b7f3c9d2-4a1e-4f8b-9c3d-2e5a7f8b9c1d",
  amount: 1250.75,
  units: "USD",
  purchase_order_id: "PO-2024-04567",
}

const UNEXPECTED = {
  ok: false,
  error: "Deepgram returned an unexpected response.",
}

type Step = { status: number; body: unknown } | "fail"

function stubFetch(...steps: Step[]) {
  const fetchMock = vi.fn()
  for (const step of steps) {
    if (step === "fail") {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
      continue
    }
    fetchMock.mockResolvedValueOnce({
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      json: async () =>
        typeof step.body === "string" ? JSON.parse(step.body) : step.body,
    } as unknown as Response)
  }
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function expectCall(
  fetchMock: ReturnType<typeof vi.fn>,
  n: number,
  url: string
) {
  expect(fetchMock).toHaveBeenNthCalledWith(
    n,
    url,
    expect.objectContaining({ headers: HEADERS })
  )
}

const usd = (balance: number, creditType: string, label: string) => ({
  creditType,
  label,
  balance,
  balanceLimit: null,
  unit: "usd",
})

describe("Deepgram adapter", () => {
  it("lists projects, then sums one project's USD balances", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: { projects: [PROJECT] } },
      {
        status: 200,
        body: {
          balances: [
            DOCS_BALANCE,
            { ...DOCS_BALANCE, balance_id: "b2", amount: 49.25, units: "usd" },
          ],
        },
      }
    )
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expectCall(fetchMock, 1, LIST_URL)
    expectCall(fetchMock, 2, balancesUrl(PROJECT.project_id))
    expect(result).toEqual({
      ok: true,
      balances: [usd(1300, "project:proj_9f8b7c6d5e4a3b2c1d0e", PROJECT.name)],
    })
  })

  it("reports one pool per project, keyed by id and labelled by name", async () => {
    const fetchMock = stubFetch(
      {
        status: 200,
        body: {
          projects: [PROJECT, { project_id: "proj_b", name: "Voice Agent" }],
        },
      },
      { status: 200, body: { balances: [DOCS_BALANCE] } },
      { status: 200, body: { balances: [{ ...DOCS_BALANCE, amount: 3.5 }] } }
    )
    const result = await adapter.readBalance(KEY)
    expectCall(fetchMock, 2, balancesUrl(PROJECT.project_id))
    expectCall(fetchMock, 3, balancesUrl("proj_b"))
    expect(result).toEqual({
      ok: true,
      balances: [
        usd(1250.75, `project:${PROJECT.project_id}`, PROJECT.name),
        usd(3.5, "project:proj_b", "Voice Agent"),
      ],
    })
  })

  it("falls back to the id prefix for a nameless project and encodes the id", async () => {
    const fetchMock = stubFetch(
      { status: 200, body: { projects: [{ project_id: "abcdef12/34 56" }] } },
      { status: 200, body: { balances: [DOCS_BALANCE] } }
    )
    const result = await adapter.readBalance(KEY)
    expectCall(fetchMock, 2, balancesUrl("abcdef12%2F34%2056"))
    expect(result).toEqual({
      ok: true,
      balances: [usd(1250.75, "project:abcdef12/34 56", "abcdef12")],
    })
  })

  it("skips a project with no purchased balance", async () => {
    stubFetch(
      {
        status: 200,
        body: { projects: [{ project_id: "proj_a", name: "Empty" }, PROJECT] },
      },
      { status: 200, body: { balances: [] } },
      { status: 200, body: { balances: [DOCS_BALANCE] } }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: true,
      balances: [usd(1250.75, `project:${PROJECT.project_id}`, PROJECT.name)],
    })
  })

  it("fails when no project yields a pool", async () => {
    stubFetch(
      { status: 200, body: { projects: [PROJECT] } },
      { status: 200, body: { balances: [] } }
    )
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
    stubFetch({ status: 200, body: { projects: [] } })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("never drops money in another unit", async () => {
    stubFetch(
      { status: 200, body: { projects: [PROJECT] } },
      {
        status: 200,
        body: { balances: [DOCS_BALANCE, { ...DOCS_BALANCE, units: "EUR" }] },
      }
    )
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("treats a missing amount as unexpected, never a zero", async () => {
    stubFetch(
      { status: 200, body: { projects: [PROJECT] } },
      { status: 200, body: { balances: [{ units: "usd" }] } }
    )
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it(`reads at most ${DEEPGRAM_MAX_PROJECTS} projects, in list order`, async () => {
    const projects = Array.from({ length: 12 }, (_, i) => ({
      project_id: `p${i}`,
      name: `P${i}`,
    }))
    const fetchMock = stubFetch(
      { status: 200, body: { projects } },
      ...Array.from({ length: 10 }, () => ({
        status: 200,
        body: { balances: [DOCS_BALANCE] },
      }))
    )
    const result = await adapter.readBalance(KEY)
    expect(fetchMock).toHaveBeenCalledTimes(11)
    expectCall(fetchMock, 11, balancesUrl("p9"))
    expect(result.ok && result.balances.map((b) => b.creditType)).toEqual(
      projects.slice(0, 10).map((p) => `project:${p.project_id}`)
    )
  })

  it("maps a 401 on the list call to a rejected key", async () => {
    // Body observed with a dummy key on 2026-10-17; never passed through.
    const fetchMock = stubFetch({
      status: 401,
      body: {
        category: "UNAUTHORIZED",
        message: "Authentication failed.",
        details: "Check that you are using the correct credentials.",
        request_id: "07ad225a-9358-40e6-a0cb-68b6894ac0aa",
      },
    })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Deepgram rejected this key.",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("maps a 403 on a balances call (no billing scope) to a rejected key", async () => {
    stubFetch(
      { status: 200, body: { projects: [PROJECT] } },
      { status: 403, body: {} }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Deepgram rejected this key.",
    })
  })

  it("maps a 429 on the list call", async () => {
    stubFetch({ status: 429, body: {} })
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Deepgram returned 429.",
    })
  })

  it("stops at the first failing balances call", async () => {
    const fetchMock = stubFetch(
      {
        status: 200,
        body: { projects: [PROJECT, { project_id: "proj_b", name: "B" }] },
      },
      { status: 500, body: {} }
    )
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Deepgram returned 500.",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("treats malformed list JSON as unexpected", async () => {
    stubFetch({ status: 200, body: "not json{" })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("treats a project without project_id as unexpected", async () => {
    stubFetch({ status: 200, body: { projects: [{ name: "No id" }] } })
    expect(await adapter.readBalance(KEY)).toEqual(UNEXPECTED)
  })

  it("maps a network failure to unreachable", async () => {
    stubFetch({ status: 200, body: { projects: [PROJECT] } }, "fail")
    expect(await adapter.readBalance(KEY)).toEqual({
      ok: false,
      error: "Couldn't reach Deepgram.",
    })
  })
})
