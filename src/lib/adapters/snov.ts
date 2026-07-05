import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type SnovCredentials = {
  clientId: string
  clientSecret: string
}

type TokenResponse = {
  access_token?: unknown
}

type BalanceResponse = {
  success?: boolean
  data?: {
    balance?: unknown
  }
  message?: string
}

export function encodeSnovCredentials(credentials: SnovCredentials): string {
  return JSON.stringify(credentials)
}

function parseCredentials(secret: string): SnovCredentials | null {
  try {
    const parsed = JSON.parse(secret) as Partial<SnovCredentials>
    if (
      typeof parsed.clientId === "string" &&
      parsed.clientId.trim() &&
      typeof parsed.clientSecret === "string" &&
      parsed.clientSecret.trim()
    ) {
      return {
        clientId: parsed.clientId.trim(),
        clientSecret: parsed.clientSecret.trim(),
      }
    }
  } catch {
    return null
  }

  return null
}

async function getAccessToken(
  credentials: SnovCredentials
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  let res: Response
  try {
    res = await timedFetch("https://api.snov.io/v1/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    })
  } catch {
    return { ok: false, error: "Couldn't reach Snov.io." }
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Snov.io rejected these credentials." }
  }
  if (!res.ok) return { ok: false, error: `Snov.io returned ${res.status}.` }

  let data: TokenResponse
  try {
    data = await res.json()
  } catch {
    return { ok: false, error: "Snov.io returned an unexpected response." }
  }

  if (typeof data.access_token !== "string" || !data.access_token.trim()) {
    return { ok: false, error: "Snov.io returned an unexpected response." }
  }

  return { ok: true, token: data.access_token.trim() }
}

export const snovAdapter: ToolAdapter = {
  toolId: "snov",
  async readBalance(secret: string): Promise<AdapterResult> {
    const credentials = parseCredentials(secret)
    if (!credentials) {
      return {
        ok: false,
        error: "Snov.io needs a client ID and client secret.",
      }
    }

    const token = await getAccessToken(credentials)
    if (!token.ok) return token

    let res: Response
    try {
      res = await timedFetch("https://api.snov.io/v1/get-balance", {
        headers: { Authorization: `Bearer ${token.token}` },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Snov.io." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Snov.io rejected these credentials." }
    }
    if (!res.ok) return { ok: false, error: `Snov.io returned ${res.status}.` }

    let data: BalanceResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Snov.io returned an unexpected response." }
    }

    if (data.success === false) {
      return {
        ok: false,
        error: data.message ?? "Snov.io returned an error.",
      }
    }

    const balance = finiteOrNull(data.data?.balance)
    if (balance === null) {
      return { ok: false, error: "Snov.io returned an unexpected response." }
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
