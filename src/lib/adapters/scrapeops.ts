import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const scrapeopsAdapter: ToolAdapter = {
  toolId: "scrapeops",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: ScrapeOps supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await fetch(
        `https://backend.scrapeops.io/v1/proxy/account/usage?api_key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach ScrapeOps." }
    }
    if (res.status === 401)
      return { ok: false, error: "ScrapeOps rejected this key." }
    if (!res.ok)
      return { ok: false, error: `ScrapeOps returned ${res.status}.` }

    let data: { plan_api_credits?: number; used_api_credits?: number }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "ScrapeOps returned an unexpected response." }
    }
    const total = toFiniteNumber(data.plan_api_credits)
    const used = toFiniteNumber(data.used_api_credits)
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance: total - used,
          balanceLimit: total || null,
          unit: "credits",
        },
      ],
    }
  },
}
