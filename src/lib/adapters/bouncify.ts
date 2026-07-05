import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const bouncifyAdapter: ToolAdapter = {
  toolId: "bouncify",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: Bouncify supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
        `https://api.bouncify.io/v1/info?apikey=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Bouncify." }
    }
    if (res.status === 401)
      return { ok: false, error: "Bouncify rejected this key." }
    if (!res.ok) return { ok: false, error: `Bouncify returned ${res.status}.` }

    let data: { credits_info?: { credits_remaining?: number } }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Bouncify returned an unexpected response." }
    }
    const balance = finiteOrNull(data.credits_info?.credits_remaining)
    if (balance === null) {
      return { ok: false, error: "Bouncify returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
