import { toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type MeltlyCreditsResponse = {
  success?: boolean
  error?: string
  message?: string
  subscriptionCredits?: unknown
  paygCredits?: unknown
  credits?: {
    subscription?: {
      remaining?: unknown
      tier?: unknown
    }
    payg?: {
      remaining?: unknown
    }
  }
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function reading(
  creditType: string,
  label: string,
  balanceValue: unknown,
  limitValue: unknown = null
): BalanceReading | null {
  const balance = finiteNumber(balanceValue)
  if (balance === null) return null

  return {
    creditType,
    label,
    balance,
    balanceLimit: finiteNumber(limitValue),
    unit: "credits",
  }
}

export const meltlyAdapter: ToolAdapter = {
  toolId: "meltly",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://melt.ly/api/user/credits", {
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Melt.ly." }
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Melt.ly rejected this key." }
    }
    if (!res.ok) return { ok: false, error: `Melt.ly returned ${res.status}.` }

    let data: MeltlyCreditsResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Melt.ly returned an unexpected response." }
    }

    if (data.success === false) {
      return {
        ok: false,
        error: data.error ?? data.message ?? "Melt.ly returned an error.",
      }
    }

    const balances = [
      reading(
        "subscription",
        "Subscription Credits",
        data.credits?.subscription?.remaining ?? data.subscriptionCredits,
        data.credits?.subscription?.tier
      ),
      reading(
        "payg",
        "Pay-as-you-go Credits",
        data.credits?.payg?.remaining ?? data.paygCredits
      ),
    ].filter((balance): balance is BalanceReading => balance !== null)

    if (balances.length === 0) {
      return { ok: false, error: "Melt.ly returned an unexpected response." }
    }

    return { ok: true, balances }
  },
}
