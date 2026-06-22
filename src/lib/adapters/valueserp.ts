import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const valueserpAdapter: ToolAdapter = {
  toolId: "valueserp",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: ValueSERP supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await fetch(
        `https://api.valueserp.com/account?api_key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach ValueSERP." }
    }
    if (res.status === 401)
      return { ok: false, error: "ValueSERP rejected this key." }
    if (!res.ok)
      return { ok: false, error: `ValueSERP returned ${res.status}.` }

    let data: {
      account_info?: {
        monthly_credits_remaining?: number
        monthly_credits_limit?: number
        topup_credits_remaining?: number
      }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "ValueSERP returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "monthly",
          label: "Monthly Credits",
          balance: toFiniteNumber(data.account_info?.monthly_credits_remaining),
          balanceLimit:
            toFiniteNumber(data.account_info?.monthly_credits_limit) || null,
          unit: "credits",
        },
        {
          creditType: "topup",
          label: "Top-up Credits",
          balance: toFiniteNumber(data.account_info?.topup_credits_remaining),
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
