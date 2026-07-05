import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const debounceAdapter: ToolAdapter = {
  toolId: "debounce",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: DeBounce supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
        `https://api.debounce.io/v1/balance/?api=${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach DeBounce." }
    }
    if (res.status === 401)
      return { ok: false, error: "DeBounce rejected this key." }
    if (!res.ok) return { ok: false, error: `DeBounce returned ${res.status}.` }

    let data: { balance?: string | number }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "DeBounce returned an unexpected response." }
    }
    const balance = finiteOrNull(data.balance)
    if (balance === null) {
      return { ok: false, error: "DeBounce returned an unexpected response." }
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
