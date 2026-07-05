import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

interface BalanceInfo {
  currency?: string
  total_balance?: unknown
  granted_balance?: unknown
  topped_up_balance?: unknown
}

export const deepseekAdapter: ToolAdapter = {
  toolId: "deepseek",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.deepseek.com/user/balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach DeepSeek." }
    }
    if (res.status === 401)
      return { ok: false, error: "DeepSeek rejected this key." }
    if (!res.ok) return { ok: false, error: `DeepSeek returned ${res.status}.` }

    let data: { is_available?: boolean; balance_infos?: BalanceInfo[] }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "DeepSeek returned an unexpected response." }
    }

    const infos = data.balance_infos
    if (!infos || infos.length === 0) {
      return {
        ok: true,
        balances: [
          {
            creditType: "balance",
            label: "Balance",
            balance: 0,
            balanceLimit: null,
            unit: "usd",
          },
        ],
      }
    }

    const entry = infos.find((e) => e.currency === "USD") ?? infos[0]
    const balance = finiteOrNull(entry.total_balance)
    if (balance === null) {
      return { ok: false, error: "DeepSeek returned an unexpected response." }
    }
    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Balance",
          balance,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
