import { finiteOrNull, timedFetch, toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const netnutAdapter: ToolAdapter = {
  toolId: "netnut",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(
        "https://customers-api.netnut.io/v1/customer/usage/myusage",
        {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/json",
          },
          body: "{}",
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach NetNut." }
    }
    if (res.status === 401)
      return { ok: false, error: "NetNut rejected this key." }
    if (!res.ok) return { ok: false, error: `NetNut returned ${res.status}.` }

    let data: { data?: Array<{ plan_gb?: number; total_gb_used?: number }> }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "NetNut returned an unexpected response." }
    }
    const rows = Array.isArray(data.data) ? data.data : []
    // The plan_gb figures anchor the pool; if none are present there is no
    // usable bandwidth limit, so report an unexpected response instead of 0.
    const hasPlan = rows.some((r) => finiteOrNull(r.plan_gb) !== null)
    if (!hasPlan) {
      return { ok: false, error: "NetNut returned an unexpected response." }
    }
    const limit = rows.reduce((s, r) => s + toFiniteNumber(r.plan_gb), 0)
    const used = rows.reduce((s, r) => s + toFiniteNumber(r.total_gb_used), 0)
    return {
      ok: true,
      balances: [
        {
          creditType: "bandwidth",
          label: "Bandwidth",
          balance: limit - used,
          balanceLimit: limit || null,
          unit: "gb",
        },
      ],
    }
  },
}
