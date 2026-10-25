import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because PredictLeads authenticates with two headers
// (X-Api-Key + X-Api-Token) and the catalog takes one key.
type PredictLeadsCredentials = {
  apiKey: string
  apiToken: string
}

type PredictLeadsResponse = {
  data?: Array<{
    attributes?: {
      monthly_credits_quota?: unknown
      monthly_credits_used?: unknown
    }
  }>
}

export function encodePredictLeadsCredentials(
  credentials: PredictLeadsCredentials
): string {
  return JSON.stringify(credentials)
}

function parseCredentials(secret: string): PredictLeadsCredentials | null {
  try {
    const parsed = JSON.parse(secret) as Partial<PredictLeadsCredentials>
    if (
      typeof parsed.apiKey === "string" &&
      parsed.apiKey.trim() &&
      typeof parsed.apiToken === "string" &&
      parsed.apiToken.trim()
    ) {
      return { apiKey: parsed.apiKey.trim(), apiToken: parsed.apiToken.trim() }
    }
  } catch {
    return null
  }
  return null
}

export const predictleadsAdapter: ToolAdapter = {
  toolId: "predictleads",
  async readBalance(secret: string): Promise<AdapterResult> {
    const credentials = parseCredentials(secret)
    if (!credentials) {
      return {
        ok: false,
        error: "PredictLeads needs an API key and API token.",
      }
    }

    let res: Response
    try {
      res = await timedFetch(
        "https://predictleads.com/api/v3/api_subscription",
        {
          headers: {
            "X-Api-Key": credentials.apiKey,
            "X-Api-Token": credentials.apiToken,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach PredictLeads." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "PredictLeads rejected these credentials." }
    if (!res.ok)
      return { ok: false, error: `PredictLeads returned ${res.status}.` }

    let data: PredictLeadsResponse
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "PredictLeads returned an unexpected response.",
      }
    }

    const attributes = data?.data?.[0]?.attributes
    const quota = finiteOrNull(attributes?.monthly_credits_quota)
    if (quota === null) {
      return {
        ok: false,
        error: "PredictLeads returned an unexpected response.",
      }
    }
    const used = finiteOrNull(attributes?.monthly_credits_used) ?? 0

    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: "Monthly credits",
          balance: quota - used,
          balanceLimit: quota,
          unit: "credits",
        },
      ],
    }
  },
}
