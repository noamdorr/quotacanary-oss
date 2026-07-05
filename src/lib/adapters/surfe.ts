import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

export const surfeAdapter: ToolAdapter = {
  toolId: "surfe",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.surfe.com/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Surfe." }
    }
    if (res.status === 401)
      return { ok: false, error: "Surfe rejected this key." }
    if (!res.ok) return { ok: false, error: `Surfe returned ${res.status}.` }

    let data: {
      totalEmail?: number
      totalMobile?: number
      totalSearch?: number
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Surfe returned an unexpected response." }
    }
    const pools: Array<[string, string, unknown]> = [
      ["email", "Email Credits", data.totalEmail],
      ["mobile", "Mobile Credits", data.totalMobile],
      ["search", "Search Credits", data.totalSearch],
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
      return { ok: false, error: "Surfe returned an unexpected response." }
    }
    return { ok: true, balances }
  },
}
