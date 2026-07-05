import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapflyAdapter: ToolAdapter = {
  toolId: "scrapfly",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: Scrapfly's /account endpoint supports only query-string key auth (no header
      // form), so the key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
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
    const balance = finiteOrNull(data.subscription?.usage?.scrape?.remaining)
    if (balance === null) {
      return { ok: false, error: "Scrapfly returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit:
            finiteOrNull(data.subscription?.usage?.scrape?.limit) || null,
          unit: "credits",
        },
      ],
    }
  },
}
