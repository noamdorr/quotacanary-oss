import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const emailhippoAdapter: ToolAdapter = {
  toolId: "emailhippo",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        `https://api.hippoapi.com/customer/reports/v3/quota/${encodeURIComponent(apiKey)}`,
        { headers: { Accept: "application/json" } }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Email Hippo." }
    }

    if (res.status === 400 || res.status === 401 || res.status === 404)
      return { ok: false, error: "Email Hippo rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Email Hippo returned ${res.status}.` }

    let data: {
      quotaRemaining?: unknown
      quotaUsed?: unknown
      errorSummary?: string | null
    }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Email Hippo returned an unexpected response.",
      }
    }

    if (data.errorSummary)
      return {
        ok: false,
        error: "Email Hippo rejected the quota request.",
      }

    const remaining = toFiniteNumber(data.quotaRemaining)
    const used = toFiniteNumber(data.quotaUsed, Number.NaN)

    return {
      ok: true,
      balances: [
        {
          creditType: "quota",
          label: "Quota",
          balance: remaining,
          balanceLimit: Number.isFinite(used) ? remaining + used : null,
          unit: "credits",
        },
      ],
    }
  },
}
