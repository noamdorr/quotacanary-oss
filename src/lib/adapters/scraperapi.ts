import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scraperapiAdapter: ToolAdapter = {
  toolId: "scraperapi",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.scraperapi.com/account?api_key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach ScraperAPI." }
    }
    if (res.status === 401)
      return { ok: false, error: "ScraperAPI rejected this key." }
    if (!res.ok)
      return { ok: false, error: `ScraperAPI returned ${res.status}.` }

    let data: { requestLimit?: unknown; requestCount?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "ScraperAPI returned an unexpected response." }
    }
    const limit = toFiniteNumber(data.requestLimit)
    const used = toFiniteNumber(data.requestCount)
    return {
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance: limit - used,
          balanceLimit: limit,
          unit: "credits",
        },
      ],
    }
  },
}
