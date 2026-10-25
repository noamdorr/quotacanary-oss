import { afterEach, describe, expect, it, vi } from "vitest"
import { type CatalogEntry, catalogAdapter } from "./catalog"

afterEach(() => vi.restoreAllMocks())

function mockFetch(body: unknown, status = 200) {
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

const BEARER_ENTRY: CatalogEntry = {
  id: "acme",
  name: "Acme",
  request: { method: "GET", url: "https://api.acme.test/v1/account" },
  auth: { in: "header", name: "Authorization", format: "Bearer {key}" },
  pools: [
    {
      creditType: "credits",
      label: "Credits",
      unit: "credits",
      balance: "data.credits_left",
    },
  ],
}

describe("catalogAdapter", () => {
  it("sends the key in the configured header and reads the balance path", async () => {
    const fetchMock = mockFetch({ data: { credits_left: 420 } })
    const result = await catalogAdapter(BEARER_ENTRY).readBalance("key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.acme.test/v1/account",
      expect.objectContaining({ headers: { Authorization: "Bearer key" } })
    )
    expect(result).toEqual({
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: 420,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })
})

describe("catalogAdapter error vocabulary", () => {
  const adapter = () => catalogAdapter(BEARER_ENTRY)

  it("reports an unreachable vendor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed")
      })
    )
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await adapter().readBalance("key")).toEqual({
      ok: false,
      error: "Couldn't reach Acme.",
    })
  })

  it("maps 401 to a rejected key and any other failure to the status", async () => {
    mockFetch({}, 401)
    expect(await adapter().readBalance("key")).toEqual({
      ok: false,
      error: "Acme rejected this key.",
    })
    mockFetch({}, 403)
    expect(await adapter().readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned 403.",
    })
    mockFetch({}, 500)
    expect(await adapter().readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned 500.",
    })
  })
})

describe("catalogAdapter body handling", () => {
  it("reports an unexpected response on a non-JSON body", async () => {
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
    expect(await catalogAdapter(BEARER_ENTRY).readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned an unexpected response.",
    })
  })

  it("treats an absent, null or empty balance as unexpected, never a false zero", async () => {
    for (const body of [{}, { data: { credits_left: null } }, { data: "x" }]) {
      mockFetch(body)
      expect(await catalogAdapter(BEARER_ENTRY).readBalance("key")).toEqual({
        ok: false,
        error: "Acme returned an unexpected response.",
      })
    }
    mockFetch({ data: { credits_left: "0" } })
    const zero = await catalogAdapter(BEARER_ENTRY).readBalance("key")
    expect(zero.ok && zero.balances[0].balance).toBe(0)
  })

  it("drops pools whose balance is missing and keeps the rest", async () => {
    const entry: CatalogEntry = {
      ...BEARER_ENTRY,
      pools: [
        { creditType: "a", label: "A", unit: "credits", balance: "a" },
        { creditType: "b", label: "B", unit: "credits", balance: "b" },
      ],
    }
    mockFetch({ b: 7 })
    expect(await catalogAdapter(entry).readBalance("key")).toEqual({
      ok: true,
      balances: [
        {
          creditType: "b",
          label: "B",
          balance: 7,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    })
  })
})

describe("catalogAdapter status overrides", () => {
  it("lets an entry treat 403 as a rejected key and 401 as a plain HTTP error", async () => {
    const entry: CatalogEntry = {
      ...BEARER_ENTRY,
      errors: { "403": "invalid_key", "401": "http" },
    }
    mockFetch({}, 403)
    expect(await catalogAdapter(entry).readBalance("key")).toEqual({
      ok: false,
      error: "Acme rejected this key.",
    })
    mockFetch({}, 401)
    expect(await catalogAdapter(entry).readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned 401.",
    })
  })
})

describe("catalogAdapter request shapes", () => {
  it("puts a query key on the URL, percent-encoded, with no headers", async () => {
    const fetchMock = mockFetch({ data: { credits_left: 1 } })
    await catalogAdapter({
      ...BEARER_ENTRY,
      request: { method: "GET", url: "https://api.acme.test/v1/balance/" },
      auth: { in: "query", name: "api_key" },
    }).readBalance("key with spaces")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.acme.test/v1/balance/?api_key=key%20with%20spaces",
      expect.not.objectContaining({ headers: expect.anything() })
    )
  })

  it("substitutes a path key into the URL template", async () => {
    const fetchMock = mockFetch({ data: { credits_left: 1 } })
    await catalogAdapter({
      ...BEARER_ENTRY,
      request: { method: "GET", url: "https://api.acme.test/quota/{key}" },
      auth: { in: "path" },
    }).readBalance("a/b")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.acme.test/quota/a%2Fb",
      expect.anything()
    )
  })

  it("sends static headers beside the auth header, and a POST body verbatim", async () => {
    const fetchMock = mockFetch({ data: { credits_left: 1 } })
    await catalogAdapter({
      ...BEARER_ENTRY,
      request: {
        method: "POST",
        url: "https://api.acme.test/v1/enrich",
        headers: { "Content-Type": "application/json" },
        body: '{"data":[{}]}',
      },
      auth: { in: "header", name: "X-Access-Token" },
    }).readBalance("key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.acme.test/v1/enrich",
      expect.objectContaining({
        method: "POST",
        headers: {
          "X-Access-Token": "key",
          "Content-Type": "application/json",
        },
        body: '{"data":[{}]}',
      })
    )
  })
})

describe("catalogAdapter pool arithmetic", () => {
  const pool = (extra: Partial<CatalogEntry["pools"][number]>) =>
    catalogAdapter({
      ...BEARER_ENTRY,
      pools: [{ creditType: "c", label: "C", unit: "credits", ...extra }],
    })
  const reading = async (adapter: ReturnType<typeof catalogAdapter>) => {
    const result = await adapter.readBalance("key")
    return result.ok ? result.balances[0] : result
  }

  it("reports an optional limit only when it is a finite number above zero", async () => {
    const adapter = pool({ balance: "left", limit: "cap" })
    mockFetch({ left: 5, cap: 100 })
    expect(await reading(adapter)).toMatchObject({
      balance: 5,
      balanceLimit: 100,
    })
    for (const cap of [0, -1, null, "x", undefined]) {
      mockFetch({ left: 5, cap })
      expect(await reading(adapter)).toMatchObject({ balanceLimit: null })
    }
  })

  it("derives balance = limit - used, keeping a zero limit and defaulting used to 0", async () => {
    const adapter = pool({ limit: "cap", used: "spent" })
    mockFetch({ cap: 1000, spent: 480 })
    expect(await reading(adapter)).toMatchObject({
      balance: 520,
      balanceLimit: 1000,
    })
    mockFetch({ cap: 0, spent: 0 })
    expect(await reading(adapter)).toMatchObject({
      balance: 0,
      balanceLimit: 0,
    })
    mockFetch({ cap: 10 })
    expect(await reading(adapter)).toMatchObject({
      balance: 10,
      balanceLimit: 10,
    })
    mockFetch({ spent: 3 })
    expect(await reading(adapter)).toEqual({
      ok: false,
      error: "Acme returned an unexpected response.",
    })
  })

  it("derives limit = balance + used when both balance and used are given", async () => {
    const adapter = pool({ balance: "remaining", used: "spent" })
    mockFetch({ remaining: 800, spent: 200 })
    expect(await reading(adapter)).toMatchObject({
      balance: 800,
      balanceLimit: 1000,
    })
    mockFetch({ remaining: 800 })
    expect(await reading(adapter)).toMatchObject({
      balance: 800,
      balanceLimit: null,
    })
  })
})

describe("catalogAdapter body-level errors", () => {
  it("passes a non-empty vendor error string through from a 2xx body", async () => {
    const adapter = catalogAdapter({ ...BEARER_ENTRY, errorPath: "error" })
    mockFetch({ error: "Invalid API key", data: { credits_left: 9 } })
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Invalid API key",
    })
    mockFetch({ error: "", data: { credits_left: 9 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
    mockFetch({ error: null, data: { credits_left: 9 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
  })

  it("treats a flag at rejectWhen.path equal to rejectWhen.equals as a rejected key", async () => {
    const adapter = catalogAdapter({
      ...BEARER_ENTRY,
      rejectWhen: { path: "request_info.success", equals: false },
    })
    mockFetch({ request_info: { success: false } })
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Acme rejected this key.",
    })
    mockFetch({ request_info: { success: true }, data: { credits_left: 2 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
    mockFetch({ data: { credits_left: 2 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
  })
})

describe("catalogAdapter bodyError", () => {
  it("fails with the first non-empty message when the flag at when.path equals the boolean", async () => {
    const adapter = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: {
        when: { path: "success", equals: false },
        messagePaths: ["error", "message"],
      },
    })
    mockFetch({ success: false, error: "", message: "Invalid API key" })
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Invalid API key",
    })
    mockFetch({ success: true, message: "ignored", data: { credits_left: 3 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
    mockFetch({ data: { credits_left: 3 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
  })

  it("falls back to the generic error copy, or the rejected-key copy, when the flag fires without a message", async () => {
    mockFetch({ success: false })
    expect(
      await catalogAdapter({
        ...BEARER_ENTRY,
        bodyError: {
          when: { path: "success", equals: false },
          messagePaths: ["message"],
        },
      }).readBalance("key")
    ).toEqual({ ok: false, error: "Acme returned an error." })
    mockFetch({ status: "auth_failure" })
    expect(
      await catalogAdapter({
        ...BEARER_ENTRY,
        bodyError: {
          when: { path: "status", notEquals: "success" },
          messagePaths: ["message"],
          fallback: "invalid_key",
        },
      }).readBalance("key")
    ).toEqual({ ok: false, error: "Acme rejected this key." })
  })

  it("treats a missing value as not equal, and any truthy value as a fired flag", async () => {
    const notEquals = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: {
        when: { path: "status", notEquals: "success" },
        messagePaths: ["message"],
      },
    })
    mockFetch({ message: "no status at all", data: { credits_left: 3 } })
    expect(await notEquals.readBalance("key")).toEqual({
      ok: false,
      error: "no status at all",
    })
    mockFetch({ status: "success", data: { credits_left: 3 } })
    expect((await notEquals.readBalance("key")).ok).toBe(true)

    const truthy = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: {
        when: { path: "error", truthy: true },
        messagePaths: ["errorMessage"],
      },
    })
    mockFetch({ error: true, errorMessage: "Out of credits" })
    expect(await truthy.readBalance("key")).toEqual({
      ok: false,
      error: "Out of credits",
    })
    mockFetch({ error: "yes" })
    expect(await truthy.readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned an error.",
    })
    mockFetch({ error: false, data: { credits_left: 3 } })
    expect((await truthy.readBalance("key")).ok).toBe(true)
    mockFetch({ error: 0, data: { credits_left: 3 } })
    expect((await truthy.readBalance("key")).ok).toBe(true)
  })

  it("without when, a non-empty string anywhere in the chain is the error, and nothing else fires", async () => {
    const adapter = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: { messagePaths: ["error", "error.message", "message"] },
    })
    mockFetch({ error: { message: "API access requires a Pro plan." } })
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "API access requires a Pro plan.",
    })
    mockFetch({ error: { code: 7 }, data: { credits_left: 3 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
    mockFetch({ message: "", data: { credits_left: 3 } })
    expect((await adapter.readBalance("key")).ok).toBe(true)
  })

  it("reads the body of a failing status only when on is non2xx or any, after the status overrides", async () => {
    const body = { message: "Agent API Billing is not enabled." }
    const non2xx = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: { messagePaths: ["message"], on: "non2xx" },
    })
    mockFetch(body, 400)
    expect(await non2xx.readBalance("key")).toEqual({
      ok: false,
      error: "Agent API Billing is not enabled.",
    })
    mockFetch({}, 400)
    expect(await non2xx.readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned 400.",
    })
    mockFetch(body, 401)
    expect(await non2xx.readBalance("key")).toEqual({
      ok: false,
      error: "Acme rejected this key.",
    })
    mockFetch({ message: "not read on 2xx", data: { credits_left: 3 } })
    expect((await non2xx.readBalance("key")).ok).toBe(true)

    const twoXX = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: { messagePaths: ["message"] },
    })
    mockFetch(body, 400)
    expect(await twoXX.readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned 400.",
    })

    const any = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: { messagePaths: ["message"], on: "any" },
    })
    mockFetch(body, 402)
    expect(await any.readBalance("key")).toEqual({
      ok: false,
      error: "Agent API Billing is not enabled.",
    })
    mockFetch(body, 200)
    expect(await any.readBalance("key")).toEqual({
      ok: false,
      error: "Agent API Billing is not enabled.",
    })
  })

  it("rejects a fallback without a when, and a when with two operators", () => {
    expect(() =>
      catalogAdapter({
        ...BEARER_ENTRY,
        bodyError: { messagePaths: ["message"], fallback: "error" },
      })
    ).toThrow()
    expect(() =>
      catalogAdapter({
        ...BEARER_ENTRY,
        bodyError: {
          when: { path: "success", equals: false, truthy: true } as never,
          messagePaths: ["message"],
        },
      })
    ).toThrow()
    expect(() =>
      catalogAdapter({
        ...BEARER_ENTRY,
        bodyError: {
          messagePaths: ["message"],
          keyRejectedWhen: { path: "code", equals: "BAD_KEY" },
        },
      })
    ).toThrow()
  })

  it("reads keyRejectedWhen as the rejected-key copy, other codes keep their message", async () => {
    const adapter = catalogAdapter({
      ...BEARER_ENTRY,
      bodyError: {
        when: { path: "error", equals: true },
        keyRejectedWhen: { path: "code", equals: "BAD_KEY" },
        messagePaths: ["code"],
        on: "non2xx",
      },
    })
    mockFetch({ error: true, code: "BAD_KEY" }, 400)
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "Acme rejected this key.",
    })
    mockFetch({ error: true, code: "OTHER" }, 400)
    expect(await adapter.readBalance("key")).toEqual({
      ok: false,
      error: "OTHER",
    })
  })
})

describe("catalogAdapter JSON paths", () => {
  it("indexes an array with a numeric segment, at the root or nested", async () => {
    const root = catalogAdapter({
      ...BEARER_ENTRY,
      pools: [{ creditType: "c", label: "C", unit: "credits", balance: "0" }],
    })
    mockFetch([95597755])
    expect((await root.readBalance("key")).ok).toBe(true)
    mockFetch([])
    expect(await root.readBalance("key")).toEqual({
      ok: false,
      error: "Acme returned an unexpected response.",
    })
    const nested = catalogAdapter({
      ...BEARER_ENTRY,
      pools: [
        {
          creditType: "c",
          label: "C",
          unit: "credits",
          balance: "data.0.left",
        },
      ],
    })
    mockFetch({ data: [{ left: 12 }] })
    expect(await nested.readBalance("key")).toMatchObject({
      ok: true,
      balances: [{ balance: 12 }],
    })
  })
})
