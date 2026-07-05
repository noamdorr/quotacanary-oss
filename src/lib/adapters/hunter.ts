import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type Pool = { used?: number; available?: number }

// Hunter's `available` is the monthly cap; remaining = available - used.
// A missing `available` means the pool wasn't reported, so drop it rather
// than record a false zero.
function pool(
  creditType: string,
  label: string,
  raw: Pool | undefined
): BalanceReading | null {
  const available = finiteOrNull(raw?.available)
  if (available === null) return null

  const used = finiteOrNull(raw?.used) ?? 0
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
      res = await timedFetch("https://api.hunter.io/v2/account", {
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
    const balances = [
      pool("searches", "Searches", requests?.searches),
      pool("verifications", "Verifications", requests?.verifications),
    ].filter((reading): reading is BalanceReading => reading !== null)

    if (balances.length === 0) {
      return { ok: false, error: "Hunter returned an unexpected response." }
    }
    return { ok: true, balances }
  },
}
