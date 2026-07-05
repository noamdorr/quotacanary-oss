import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapingbeeAdapter: ToolAdapter = {
  toolId: "scrapingbee",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://app.scrapingbee.com/api/v1/usage", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach ScrapingBee." }
    }
    if (res.status === 401)
      return { ok: false, error: "ScrapingBee rejected this key." }
    if (!res.ok)
      return { ok: false, error: `ScrapingBee returned ${res.status}.` }

    let data: { max_api_credit?: unknown; used_api_credit?: unknown }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "ScrapingBee returned an unexpected response.",
      }
    }
    const limit = finiteOrNull(data.max_api_credit)
    if (limit === null) {
      return {
        ok: false,
        error: "ScrapingBee returned an unexpected response.",
      }
    }
    const used = finiteOrNull(data.used_api_credit) ?? 0
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "API Credits",
          balance: limit - used,
          balanceLimit: limit,
          unit: "credits",
        },
      ],
    }
  },
}
