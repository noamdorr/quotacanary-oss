import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapflyAdapter: ToolAdapter = {
  toolId: "scrapfly",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.scrapfly.io/account?key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Scrapfly." }
    }
    if (res.status === 401)
      return { ok: false, error: "Scrapfly rejected this key." }
    if (!res.ok) return { ok: false, error: `Scrapfly returned ${res.status}.` }

    let data: {
      subscription?: {
        usage?: { scrape?: { remaining?: number; limit?: number } }
      }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Scrapfly returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: toFiniteNumber(data.subscription?.usage?.scrape?.remaining),
          balanceLimit:
            toFiniteNumber(data.subscription?.usage?.scrape?.limit) || null,
          unit: "credits",
        },
      ],
    }
  },
}
