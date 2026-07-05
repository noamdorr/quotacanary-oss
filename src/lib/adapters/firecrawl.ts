import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const firecrawlAdapter: ToolAdapter = {
  toolId: "firecrawl",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.firecrawl.dev/v2/team/credit-usage", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Firecrawl." }
    }

    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Firecrawl rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Firecrawl returned ${res.status}.` }

    let data: {
      success?: boolean
      data?: { remainingCredits?: unknown; planCredits?: unknown }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Firecrawl returned an unexpected response." }
    }

    if (data.success === false)
      return {
        ok: false,
        error: "Firecrawl rejected the credit usage request.",
      }

    const balance = finiteOrNull(data.data?.remainingCredits)
    if (balance === null) {
      return { ok: false, error: "Firecrawl returned an unexpected response." }
    }
    const planCredits = finiteOrNull(data.data?.planCredits)

    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit: planCredits,
          unit: "credits",
        },
      ],
    }
  },
}
