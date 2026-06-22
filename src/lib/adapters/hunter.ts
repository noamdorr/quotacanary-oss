import { toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type Pool = { used?: number; available?: number }

// Hunter's `available` is the monthly cap; remaining = available - used.
function pool(
  creditType: string,
  label: string,
  raw: Pool | undefined
): BalanceReading {
  const used = toFiniteNumber(raw?.used)
  const available = toFiniteNumber(raw?.available)
  return {
    creditType,
    label,
    balance: available - used,
    balanceLimit: available,
    unit: "credits",
  }
}

export const hunterAdapter: ToolAdapter = {
  toolId: "hunter",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.hunter.io/v2/account", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Hunter." }
    }
    if (res.status === 401)
      return { ok: false, error: "Hunter rejected this key." }
    if (!res.ok) return { ok: false, error: `Hunter returned ${res.status}.` }

    let data: {
      data?: {
        requests?: { searches?: Pool; verifications?: Pool }
      }
    }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Hunter returned an unexpected response." }
    }
    const requests = data.data?.requests
    return {
      ok: true,
      balances: [
        pool("searches", "Searches", requests?.searches),
        pool("verifications", "Verifications", requests?.verifications),
      ],
    }
  },
}
