import { Buffer } from "node:buffer"
import { timedFetch, toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type VerifaliaCredentials = {
  username: string
  password: string
}

type VerifaliaResponse = {
  creditPacks?: unknown
  freeCredits?: unknown
  message?: string
}

export function encodeVerifaliaCredentials(
  credentials: VerifaliaCredentials
): string {
  return JSON.stringify(credentials)
}

function parseCredentials(secret: string): VerifaliaCredentials | null {
  try {
    const parsed = JSON.parse(secret) as Partial<VerifaliaCredentials>
    if (
      typeof parsed.username === "string" &&
      parsed.username.trim() &&
      typeof parsed.password === "string" &&
      parsed.password.trim()
    ) {
      return {
        username: parsed.username.trim(),
        password: parsed.password.trim(),
      }
    }
  } catch {
    return null
  }

  return null
}

function finiteNumber(value: unknown): number | null {
  const n = toFiniteNumber(value, Number.NaN)
  return Number.isFinite(n) ? n : null
}

export const verifaliaAdapter: ToolAdapter = {
  toolId: "verifalia",
  async readBalance(secret: string): Promise<AdapterResult> {
    const credentials = parseCredentials(secret)
    if (!credentials) {
      return {
        ok: false,
        error: "Verifalia needs an API username and password.",
      }
    }

    let res: Response
    try {
      res = await timedFetch("https://api.verifalia.com/v2.7/credits/balance", {
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(
            `${credentials.username}:${credentials.password}`
          ).toString("base64")}`,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Verifalia." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Verifalia rejected these credentials." }
    }
    if (!res.ok)
      return { ok: false, error: `Verifalia returned ${res.status}.` }

    let data: VerifaliaResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Verifalia returned an unexpected response." }
    }

    if (data.message) return { ok: false, error: data.message }

    const creditPacks = finiteNumber(data.creditPacks)
    if (creditPacks === null) {
      return { ok: false, error: "Verifalia returned an unexpected response." }
    }

    const balances: BalanceReading[] = [
      {
        creditType: "credit_packs",
        label: "Credit Packs",
        balance: creditPacks,
        balanceLimit: null,
        unit: "credits",
      },
    ]

    const freeCredits = finiteNumber(data.freeCredits)
    if (freeCredits !== null) {
      balances.push({
        creditType: "free_daily",
        label: "Free Daily Credits",
        balance: freeCredits,
        balanceLimit: null,
        unit: "credits",
      })
    }

    return { ok: true, balances }
  },
}
