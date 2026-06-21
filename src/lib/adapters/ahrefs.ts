import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type AhrefsLimitsAndUsage = {
  units_limit_workspace?: unknown
  units_usage_workspace?: unknown
  units_limit_api_key?: unknown
  units_usage_api_key?: unknown
}

type AhrefsResponse = {
  error?: string
  limits_and_usage?: AhrefsLimitsAndUsage
}

type RemainingUnits = {
  balance: number
  balanceLimit: number
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function remainingUnits(limit: unknown, usage: unknown): RemainingUnits | null {
  const balanceLimit = finiteNumber(limit)
  if (balanceLimit === null) return null

  const used = finiteNumber(usage) ?? 0
  return {
    balance: Math.max(balanceLimit - used, 0),
    balanceLimit,
  }
}

function tighterCap(
  workspace: RemainingUnits | null,
  apiKey: RemainingUnits | null
): RemainingUnits | null {
  if (!workspace) return apiKey
  if (!apiKey) return workspace
  return apiKey.balance < workspace.balance ? apiKey : workspace
}

export const ahrefsAdapter: ToolAdapter = {
  toolId: "ahrefs",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch(
        "https://api.ahrefs.com/v3/subscription-info/limits-and-usage",
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Ahrefs." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Ahrefs rejected this key." }
    }
    if (!res.ok) return { ok: false, error: `Ahrefs returned ${res.status}.` }

    let data: AhrefsResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Ahrefs returned an unexpected response." }
    }

    if (data.error) return { ok: false, error: data.error }

    const limits = data.limits_and_usage
    if (!limits) {
      return { ok: false, error: "Ahrefs returned an unexpected response." }
    }

    const remaining = tighterCap(
      remainingUnits(
        limits.units_limit_workspace,
        limits.units_usage_workspace
      ),
      remainingUnits(limits.units_limit_api_key, limits.units_usage_api_key)
    )

    if (!remaining) {
      return {
        ok: false,
        error: "Ahrefs did not return a usable API units limit.",
      }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "units",
          label: "API Units",
          balance: remaining.balance,
          balanceLimit: remaining.balanceLimit,
          unit: "credits",
        },
      ],
    }
  },
}
