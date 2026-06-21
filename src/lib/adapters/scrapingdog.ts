import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapingdogAdapter: ToolAdapter = {
  toolId: "scrapingdog",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.scrapingdog.com/account?api_key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Scrapingdog." }
    }
    if (res.status === 401)
      return { ok: false, error: "Scrapingdog rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Scrapingdog returned ${res.status}.` }

    let data: { requestLimit?: unknown; requestUsed?: unknown }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Scrapingdog returned an unexpected response.",
      }
    }
    const limit = toFiniteNumber(data.requestLimit)
    const used = toFiniteNumber(data.requestUsed)
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
