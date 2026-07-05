import { timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type ContactOutUsage = {
  quota?: unknown
  remaining?: unknown
  phone_quota?: unknown
  phone_remaining?: unknown
  search_quota?: unknown
  search_remaining?: unknown
}

type ContactOutResponse = {
  status_code?: unknown
  message?: string
  usage?: ContactOutUsage
}

type PoolConfig = {
  creditType: string
  label: string
  quotaField: keyof ContactOutUsage
  remainingField: keyof ContactOutUsage
}

const POOLS: PoolConfig[] = [
  {
    creditType: "email",
    label: "Email Credits",
    quotaField: "quota",
    remainingField: "remaining",
  },
  {
    creditType: "phone",
    label: "Phone Credits",
    quotaField: "phone_quota",
    remainingField: "phone_remaining",
  },
  {
    creditType: "search",
    label: "Search Credits",
    quotaField: "search_quota",
    remainingField: "search_remaining",
  },
]

function finiteNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toReading(
  usage: ContactOutUsage,
  pool: PoolConfig
): BalanceReading | null {
  const quota = finiteNumber(usage[pool.quotaField])
  const remaining = finiteNumber(usage[pool.remainingField])
  const balance = remaining ?? quota
  if (balance === null) return null

  return {
    creditType: pool.creditType,
    label: pool.label,
    balance,
    balanceLimit: remaining === null ? null : quota,
    unit: "credits",
  }
}

export const contactoutAdapter: ToolAdapter = {
  toolId: "contactout",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.contactout.com/v1/stats", {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authorization: "basic",
          token: apiKey,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach ContactOut." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "ContactOut rejected this token." }
    }
    if (!res.ok)
      return { ok: false, error: `ContactOut returned ${res.status}.` }

    let data: ContactOutResponse
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "ContactOut returned an unexpected response.",
      }
    }

    const statusCode = finiteNumber(data.status_code)
    if (statusCode !== null && statusCode >= 400) {
      return {
        ok: false,
        error: data.message ?? "ContactOut returned an error.",
      }
    }

    if (!data.usage) {
      return {
        ok: false,
        error: "ContactOut returned an unexpected response.",
      }
    }

    const usage = data.usage
    const balances = POOLS.map((pool) => toReading(usage, pool)).filter(
      (reading): reading is BalanceReading => reading !== null
    )

    if (balances.length === 0) {
      return {
        ok: false,
        error: "ContactOut returned an unexpected response.",
      }
    }

    return { ok: true, balances }
  },
}
