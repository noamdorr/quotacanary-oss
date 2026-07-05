import { timedFetch, toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type OpporaCreditPool = {
  remaining?: unknown
}

type OpporaCreditsResponse = {
  data_credits?: OpporaCreditPool
  phone_credits?: OpporaCreditPool
  error?: string | { message?: string }
  message?: string
}

type PoolConfig = {
  creditType: string
  label: string
  field: keyof Pick<OpporaCreditsResponse, "data_credits" | "phone_credits">
}

const POOLS: PoolConfig[] = [
  {
    creditType: "data",
    label: "Data Credits",
    field: "data_credits",
  },
  {
    creditType: "phone",
    label: "Phone Credits",
    field: "phone_credits",
  },
]

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null

  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function errorMessage(data: OpporaCreditsResponse | null): string | null {
  if (!data) return null
  if (typeof data.error === "string") return data.error
  if (typeof data.error?.message === "string") return data.error.message
  return data.message ?? null
}

async function readJson(res: Response): Promise<OpporaCreditsResponse | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function toReading(
  data: OpporaCreditsResponse,
  pool: PoolConfig
): BalanceReading | null {
  const balance = finiteNumber(data[pool.field]?.remaining)
  if (balance === null) return null

  return {
    creditType: pool.creditType,
    label: pool.label,
    balance,
    balanceLimit: null,
    unit: "credits",
  }
}

export const opporaAdapter: ToolAdapter = {
  toolId: "oppora",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.oppora.ai/api/v1/public/credits", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Oppora." }
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Oppora rejected this key." }
    }

    const data = await readJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: errorMessage(data) ?? `Oppora returned ${res.status}.`,
      }
    }
    if (!data)
      return { ok: false, error: "Oppora returned an unexpected response." }

    const message = errorMessage(data)
    if (message) return { ok: false, error: message }

    const balances = POOLS.map((pool) => toReading(data, pool)).filter(
      (reading): reading is BalanceReading => reading !== null
    )

    if (balances.length === 0) {
      return { ok: false, error: "Oppora returned an unexpected response." }
    }

    return { ok: true, balances }
  },
}
