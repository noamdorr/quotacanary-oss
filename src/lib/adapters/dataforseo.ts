import { Buffer } from "node:buffer"
import { toFiniteNumber } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type DataForSeoCredentials = {
  login: string
  password: string
}

type DataForSeoResponse = {
  status_code?: number
  status_message?: string
  tasks?: {
    status_code?: number
    status_message?: string
    result?: { money?: { balance?: unknown } }[]
  }[]
}

export function encodeDataForSeoCredentials(
  credentials: DataForSeoCredentials
): string {
  return JSON.stringify(credentials)
}

function parseCredentials(secret: string): DataForSeoCredentials | null {
  try {
    const parsed = JSON.parse(secret) as Partial<DataForSeoCredentials>
    if (
      typeof parsed.login === "string" &&
      parsed.login.trim() &&
      typeof parsed.password === "string" &&
      parsed.password.trim()
    ) {
      return {
        login: parsed.login.trim(),
        password: parsed.password.trim(),
      }
    }
    return null
  } catch {
    // Fall through to the login:password compatibility path.
  }

  const separator = secret.indexOf(":")
  if (separator <= 0) return null
  const login = secret.slice(0, separator).trim()
  const password = secret.slice(separator + 1).trim()
  return login && password ? { login, password } : null
}

function rejected(status: number): boolean {
  return status === 401 || status === 403
}

export const dataforseoAdapter: ToolAdapter = {
  toolId: "dataforseo",
  async readBalance(secret: string): Promise<AdapterResult> {
    const credentials = parseCredentials(secret)
    if (!credentials) {
      return {
        ok: false,
        error: "DataForSEO needs an API login and API password.",
      }
    }

    let res: Response
    try {
      res = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${credentials.login}:${credentials.password}`
          ).toString("base64")}`,
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach DataForSEO." }
    }
    if (rejected(res.status)) {
      return { ok: false, error: "DataForSEO rejected these credentials." }
    }
    if (!res.ok)
      return { ok: false, error: `DataForSEO returned ${res.status}.` }

    let data: DataForSeoResponse
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "DataForSEO returned an unexpected response.",
      }
    }

    if (data.status_code && data.status_code !== 20000) {
      return {
        ok: false,
        error:
          data.status_message ?? `DataForSEO returned ${data.status_code}.`,
      }
    }

    const task = data.tasks?.[0]
    if (task?.status_code && task.status_code !== 20000) {
      return {
        ok: false,
        error:
          task.status_message ?? `DataForSEO returned ${task.status_code}.`,
      }
    }

    const balance = toFiniteNumber(
      task?.result?.[0]?.money?.balance,
      Number.NaN
    )
    if (!Number.isFinite(balance)) {
      return {
        ok: false,
        error: "DataForSEO returned an unexpected response.",
      }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "balance",
          label: "Account Balance",
          balance,
          balanceLimit: null,
          unit: "usd",
        },
      ],
    }
  },
}
