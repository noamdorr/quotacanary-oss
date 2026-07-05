import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const zenserpAdapter: ToolAdapter = {
  toolId: "zenserp",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://app.zenserp.com/api/v2/status", {
        headers: { apikey: apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Zenserp." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Zenserp rejected this key." }
    if (!res.ok) return { ok: false, error: `Zenserp returned ${res.status}.` }

    let data: { remaining_requests?: number }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Zenserp returned an unexpected response." }
    }
    const balance = finiteOrNull(data.remaining_requests)
    if (balance === null) {
      return { ok: false, error: "Zenserp returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "requests",
          label: "Requests",
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
