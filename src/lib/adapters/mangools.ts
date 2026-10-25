import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

// Hand-written because GET /kwfinder/limits does not authenticate: a missing
// or wrong token gets HTTP 200 with zero remaining in every pool, and the
// body has no flag that tells it apart from a real account (upgraded_account
// is false on every free plan too). The catalog would read a bad key as a
// real 0. The OpenAPI spec says to validate the key on an authenticated
// operation instead, so this first calls GET /kwfinder/requests (lookup
// history, no quota pool), which answers 401 on a bad token.
const MANGOOLS_API_URL = "https://api.mangools.com/v3"

const UNEXPECTED = "Mangools returned an unexpected response."

// Pools from resources in /kwfinder/limits. Keyword and SERP lookups are
// daily; backlink rows are monthly.
const POOLS = [
  {
    creditType: "keyword_lookups",
    label: "Keyword lookups",
    field: "related-keywords",
  },
  { creditType: "serp_lookups", label: "SERP lookups", field: "serps" },
  { creditType: "backlink_rows", label: "Backlink rows", field: "links" },
] as const

type MangoolsPool = { limit?: unknown; remaining?: unknown }

async function get(path: string, apiKey: string): Promise<Response> {
  return timedFetch(`${MANGOOLS_API_URL}${path}`, {
    headers: { "X-Access-Token": apiKey },
  })
}

export const mangoolsAdapter: ToolAdapter = {
  toolId: "mangools",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let auth: Response
    let res: Response
    try {
      auth = await get("/kwfinder/requests", apiKey)
      if (auth.status === 401 || auth.status === 403)
        return { ok: false, error: "Mangools rejected this key." }
      if (!auth.ok)
        return { ok: false, error: `Mangools returned ${auth.status}.` }
      res = await get("/kwfinder/limits", apiKey)
    } catch {
      return { ok: false, error: "Couldn't reach Mangools." }
    }
    if (!res.ok) return { ok: false, error: `Mangools returned ${res.status}.` }

    let data: { resources?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    const resources = data?.resources
    if (typeof resources !== "object" || resources === null)
      return { ok: false, error: UNEXPECTED }

    const balances: BalanceReading[] = []
    for (const pool of POOLS) {
      const entry = (resources as Record<string, MangoolsPool | undefined>)[
        pool.field
      ]
      const limit = finiteOrNull(entry?.limit)
      const remaining = finiteOrNull(entry?.remaining)
      // A limit of 0 means the plan does not include this pool; reading it
      // would show a pool that is always dry.
      if (limit === null || remaining === null || limit <= 0) continue
      balances.push({
        creditType: pool.creditType,
        label: pool.label,
        balance: remaining,
        balanceLimit: limit,
        unit: "credits",
      })
    }
    if (balances.length === 0) return { ok: false, error: UNEXPECTED }
    return { ok: true, balances }
  },
}
