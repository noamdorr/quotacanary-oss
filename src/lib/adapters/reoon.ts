import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

export const reoonAdapter: ToolAdapter = {
  toolId: "reoon",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: Reoon supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
        `https://emailverifier.reoon.com/api/v1/check-account-balance/?key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Reoon." }
    }
    if (res.status === 401)
      return { ok: false, error: "Reoon rejected this key." }
    if (!res.ok) return { ok: false, error: `Reoon returned ${res.status}.` }

    let data: {
      remaining_instant_credits?: number
      remaining_daily_credits?: number
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Reoon returned an unexpected response." }
    }
    const pools: Array<[string, string, unknown]> = [
      ["instant", "Credits", data.remaining_instant_credits],
      ["daily", "Daily Credits", data.remaining_daily_credits],
    ]
    const balances = pools
      .map(([creditType, label, value]): BalanceReading | null => {
        const balance = finiteOrNull(value)
        if (balance === null) return null
        return {
          creditType,
          label,
          balance,
          balanceLimit: null,
          unit: "credits",
        }
      })
      .filter((reading): reading is BalanceReading => reading !== null)

    if (balances.length === 0) {
      return { ok: false, error: "Reoon returned an unexpected response." }
    }
    return { ok: true, balances }
  },
}
