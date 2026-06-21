import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapegraphaiAdapter: ToolAdapter = {
  toolId: "scrapegraphai",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://v2-api.scrapegraphai.com/api/credits", {
        headers: { "SGAI-APIKEY": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach ScrapeGraphAI." }
    }

    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "ScrapeGraphAI rejected this key." }
    if (!res.ok)
      return { ok: false, error: `ScrapeGraphAI returned ${res.status}.` }

    let data: { remaining?: unknown }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "ScrapeGraphAI returned an unexpected response.",
      }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.remaining),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
