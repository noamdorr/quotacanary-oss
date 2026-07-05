import { timedFetch, toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

function parseDollarBalance(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value !== "string") return Number.NaN
  return toFiniteNumber(value.replace(/[$,]/g, ""), Number.NaN)
}

export const orthogonalAdapter: ToolAdapter = {
  toolId: "orthogonal",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.orthogonal.com/v1/credits/balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Orthogonal." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Orthogonal rejected this key." }
    if (!res.ok)
      return { ok: false, error: `Orthogonal returned ${res.status}.` }

    let data: { balance?: unknown }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "Orthogonal returned an unexpected response.",
      }
    }

    const balance = parseDollarBalance(data.balance)
    if (!Number.isFinite(balance)) {
      return {
        ok: false,
        error: "Orthogonal returned an unexpected response.",
      }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Credit Balance",
          balance,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
