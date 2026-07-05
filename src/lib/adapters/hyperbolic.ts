import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const hyperbolicAdapter: ToolAdapter = {
  toolId: "hyperbolic",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(
        "https://api.hyperbolic.xyz/billing/get_current_balance",
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Hyperbolic." }
    }
    if (res.status === 401)
      return { ok: false, error: "Hyperbolic rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Hyperbolic returned ${res.status}.` }

    let data: { credits?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Hyperbolic returned an unexpected response." }
    }
    const credits = finiteOrNull(data.credits)
    if (credits === null) {
      return { ok: false, error: "Hyperbolic returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance: credits / 100,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
