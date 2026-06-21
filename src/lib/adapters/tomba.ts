import { toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type TombaCredentials = {
  key: string
  secret: string
}

type CreditUsage = {
  available?: unknown
  used?: unknown
}

type TombaResponse = {
  data?: {
    requests?: {
      domains?: CreditUsage
      verifications?: CreditUsage
      phones?: CreditUsage
      b2b?: CreditUsage
    }
  }
}

const POOLS = [
  ["searches", "Searches", "domains"],
  ["verifications", "Verifications", "verifications"],
  ["phones", "Phones", "phones"],
  ["b2b", "B2B", "b2b"],
] as const

export function encodeTombaCredentials(credentials: TombaCredentials): string {
  return JSON.stringify(credentials)
}

function parseCredentials(secret: string): TombaCredentials | null {
  try {
    const parsed = JSON.parse(secret) as Partial<TombaCredentials>
    if (
      typeof parsed.key === "string" &&
      parsed.key.trim() &&
      typeof parsed.secret === "string" &&
      parsed.secret.trim()
    ) {
      return {
        key: parsed.key.trim(),
        secret: parsed.secret.trim(),
      }
    }
  } catch {
    return null
  }

  return null
}

function toReading(
  creditType: string,
  label: string,
  usage: CreditUsage | undefined
): BalanceReading {
  const available = toFiniteNumber(usage?.available)
  const used = toFiniteNumber(usage?.used)
  const limit = available + used

  return {
    creditType,
    label,
    balance: available,
    balanceLimit: limit || null,
    unit: "credits",
  }
}

export const tombaAdapter: ToolAdapter = {
  toolId: "tomba",
  async readBalance(secret: string): Promise<AdapterResult> {
    const credentials = parseCredentials(secret)
    if (!credentials) {
      return { ok: false, error: "Tomba needs an API key and API secret." }
    }

    let res: Response
    try {
      res = await fetch("https://api.tomba.io/v1/me", {
        headers: {
          "X-Tomba-Key": credentials.key,
          "X-Tomba-Secret": credentials.secret,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Tomba." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Tomba rejected these credentials." }
    if (!res.ok) return { ok: false, error: `Tomba returned ${res.status}.` }

    let data: TombaResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Tomba returned an unexpected response." }
    }

    return {
      ok: true,
      balances: POOLS.map(([creditType, label, field]) =>
        toReading(creditType, label, data.data?.requests?.[field])
      ),
    }
  },
}
