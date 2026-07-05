import { timedFetch, toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type ShodanResponse = {
  error?: string
  query_credits?: unknown
  scan_credits?: unknown
  usage_limits?: {
    query_credits?: unknown
    scan_credits?: unknown
  }
}

function finiteNumber(value: unknown): number | null {
  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function finiteLimit(value: unknown): number | null {
  const limit = finiteNumber(value)
  return limit !== null && limit >= 0 ? limit : null
}

function toReading(
  creditType: string,
  label: string,
  balanceValue: unknown,
  limitValue: unknown
): BalanceReading | null {
  const balance = finiteNumber(balanceValue)
  if (balance === null) return null

  return {
    creditType,
    label,
    balance,
    balanceLimit: finiteLimit(limitValue),
    unit: "credits",
  }
}

export const shodanAdapter: ToolAdapter = {
  toolId: "shodan",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // SECURITY: Shodan supports only query-string key auth (no header form), so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
        `https://api.shodan.io/api-info?key=${encodeURIComponent(apiKey)}`,
        { headers: { Accept: "application/json" } }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Shodan." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Shodan rejected this key." }
    }
    if (!res.ok) return { ok: false, error: `Shodan returned ${res.status}.` }

    let data: ShodanResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Shodan returned an unexpected response." }
    }

    if (data.error) return { ok: false, error: data.error }

    const balances = [
      toReading(
        "query",
        "Query Credits",
        data.query_credits,
        data.usage_limits?.query_credits
      ),
      toReading(
        "scan",
        "Scan Credits",
        data.scan_credits,
        data.usage_limits?.scan_credits
      ),
    ].filter((reading): reading is BalanceReading => reading !== null)

    if (balances.length === 0) {
      return { ok: false, error: "Shodan returned an unexpected response." }
    }

    return { ok: true, balances }
  },
}
