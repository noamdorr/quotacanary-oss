import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const serpapiAdapter: ToolAdapter = {
  toolId: "serpapi",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: SerpApi's account endpoint supports only query-string key auth (no header
      // form), so the key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await fetch(
        `https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach SerpApi." }
    }
    if (res.status === 401)
      return { ok: false, error: "SerpApi rejected this key." }
    if (!res.ok) return { ok: false, error: `SerpApi returned ${res.status}.` }

    let data: { total_searches_left?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "SerpApi returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "searches",
          label: "Searches Left",
          balance: toFiniteNumber(data.total_searches_left),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
