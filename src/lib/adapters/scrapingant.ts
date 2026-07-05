import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapingantAdapter: ToolAdapter = {
  toolId: "scrapingant",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(
        `https://api.scrapingant.com/v2/usage?x-api-key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach ScrapingAnt." }
    }
    if (res.status === 401)
      return { ok: false, error: "ScrapingAnt rejected this key." }
    if (!res.ok)
      return { ok: false, error: `ScrapingAnt returned ${res.status}.` }

    let data: { remained_credits?: number; plan_total_credits?: number }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "ScrapingAnt returned an unexpected response.",
      }
    }
    const balance = finiteOrNull(data.remained_credits)
    if (balance === null) {
      return {
        ok: false,
        error: "ScrapingAnt returned an unexpected response.",
      }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit: finiteOrNull(data.plan_total_credits) || null,
          unit: "credits",
        },
      ],
    }
  },
}
