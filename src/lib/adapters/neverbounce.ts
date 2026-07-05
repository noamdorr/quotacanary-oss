import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const neverbounceAdapter: ToolAdapter = {
  toolId: "neverbounce",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: NeverBounce supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
        `https://api.neverbounce.com/v4/account/info?key=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach NeverBounce." }
    }
    if (!res.ok)
      return { ok: false, error: `NeverBounce returned ${res.status}.` }

    let data: {
      status?: string
      message?: string
      credits_info?: { paid_credits_remaining?: number }
    }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "NeverBounce returned an unexpected response.",
      }
    }
    // NeverBounce returns HTTP 200 with status:"auth_failure" on a bad key
    if (data.status !== "success") {
      return {
        ok: false,
        error: data.message ?? "NeverBounce rejected this key.",
      }
    }
    const balance = finiteOrNull(data.credits_info?.paid_credits_remaining)
    if (balance === null) {
      return {
        ok: false,
        error: "NeverBounce returned an unexpected response.",
      }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "paid_credits",
          label: "Paid Credits",
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
