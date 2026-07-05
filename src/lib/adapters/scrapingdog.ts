import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapingdogAdapter: ToolAdapter = {
  toolId: "scrapingdog",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: Scrapingdog's /account endpoint supports only query-string key auth (no header
      // form), so the key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
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
    const limit = finiteOrNull(data.requestLimit)
    if (limit === null) {
      return {
        ok: false,
        error: "Scrapingdog returned an unexpected response.",
      }
    }
    const used = finiteOrNull(data.requestUsed) ?? 0
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
