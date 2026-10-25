import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because People Data Labs exposes the remaining credit balance
// only in response headers (`x-totallimit-remaining`); the catalog reads JSON
// bodies. The docs' own example for reading limits is a HEAD on Person
// Enrichment with no parameters, so nothing is enriched. That bare request is
// expected to answer 4xx while still carrying the limit headers, so a numeric
// header wins over the status (except a rejected key).
const PDL_ENRICH_URL = "https://api.peopledatalabs.com/v5/person/enrich"

export const peopledatalabsAdapter: ToolAdapter = {
  toolId: "peopledatalabs",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(PDL_ENRICH_URL, {
        method: "HEAD",
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      })
    } catch {
      return { ok: false, error: "Couldn't reach People Data Labs." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "People Data Labs rejected this key." }

    // Includes purchased and overage credits; the split headers are ignored.
    const remaining = finiteOrNull(res.headers.get("x-totallimit-remaining"))
    if (remaining !== null) {
      return {
        ok: true,
        balances: [
          {
            creditType: "credits",
            label: "Credits",
            balance: remaining,
            balanceLimit: null,
            unit: "credits",
          },
        ],
      }
    }
    if (!res.ok)
      return { ok: false, error: `People Data Labs returned ${res.status}.` }
    return {
      ok: false,
      error: "People Data Labs returned an unexpected response.",
    }
  },
}
