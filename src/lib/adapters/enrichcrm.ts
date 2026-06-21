import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type JsonRecord = Record<string, unknown>

const BALANCE_FIELDS = [
  "remainingCredits",
  "remaining_credits",
  "credits",
  "credit",
  "remaining",
  "balance",
  "creditBalance",
  "credit_balance",
]

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

function extractBalance(value: unknown): number | null {
  const direct = finiteNumber(value)
  if (direct !== null) return direct
  if (!isRecord(value)) return null

  for (const field of BALANCE_FIELDS) {
    const candidate = finiteNumber(value[field])
    if (candidate !== null) return candidate
  }

  return extractBalance(value.data) ?? extractBalance(value.result)
}

function vendorError(value: unknown): string | null {
  if (!isRecord(value)) return null

  const message = typeof value.message === "string" ? value.message : null
  const code = finiteNumber(value.code)
  if (code !== null && code !== 0) {
    if (message?.toLowerCase().includes("can't get credit")) {
      return "Enrich CRM couldn't read credits for this key."
    }
    return message ?? "Enrich CRM returned an error."
  }

  if (value.success === false) {
    return message ?? "Enrich CRM returned an error."
  }

  return null
}

export const enrichcrmAdapter: ToolAdapter = {
  toolId: "enrichcrm",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    const url = new URL("https://gateway.enrich-crm.com/api/credit_crm/v1/mine")
    url.searchParams.set("apiId", apiKey)

    let res: Response
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Enrich CRM." }
    }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      if (!res.ok) {
        return { ok: false, error: `Enrich CRM returned ${res.status}.` }
      }
      return { ok: false, error: "Enrich CRM returned an unexpected response." }
    }

    const error = vendorError(data)
    if (error) return { ok: false, error }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Enrich CRM rejected this key." }
    }
    if (!res.ok) {
      return { ok: false, error: `Enrich CRM returned ${res.status}.` }
    }

    const balance = extractBalance(data)
    if (balance === null) {
      return { ok: false, error: "Enrich CRM returned an unexpected response." }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Credits",
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
