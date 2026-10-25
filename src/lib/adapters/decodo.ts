import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

// Hand-written because the catalog makes one request per tool: the residential
// traffic cap lives on the subscription, while usage is only reported per
// sub-user, so the read takes two sequential calls and an array sum.
const BASE_URL = "https://api.decodo.com/v2"
const RESIDENTIAL = "residential_proxies"
const UNEXPECTED = "Decodo returned an unexpected response."

type Fetched = { ok: true; data: unknown } | { ok: false; error: string }

async function getJson(url: string, apiKey: string): Promise<Fetched> {
  let res: Response
  try {
    // The public API key goes in the header as is, with no scheme prefix.
    res = await timedFetch(url, { headers: { Authorization: apiKey } })
  } catch {
    return { ok: false, error: "Couldn't reach Decodo." }
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Decodo rejected this key." }
  }
  if (!res.ok) return { ok: false, error: `Decodo returned ${res.status}.` }
  try {
    return { ok: true, data: await res.json() }
  } catch {
    return { ok: false, error: UNEXPECTED }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

// Sum of the residential subscriptions' traffic_limit (GB, sent as a string).
// The docs example is a single object, the live shape may be a list: both are
// read. null = no residential subscription or a non-numeric limit.
function residentialLimit(data: unknown): number | null {
  const entries = Array.isArray(data) ? data : [data]
  let total = 0
  let found = false
  for (const entry of entries) {
    const record = asRecord(entry)
    if (!record) return null
    if (record.service_type !== RESIDENTIAL) continue
    const limit = finiteOrNull(record.traffic_limit)
    if (limit === null) return null
    total += limit
    found = true
  }
  return found ? total : null
}

export const decodoAdapter: ToolAdapter = {
  toolId: "decodo",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    const subscriptions = await getJson(`${BASE_URL}/subscriptions`, apiKey)
    if (!subscriptions.ok) return subscriptions
    const limit = residentialLimit(subscriptions.data)
    if (limit === null) return { ok: false, error: UNEXPECTED }

    const subUsers = await getJson(
      `${BASE_URL}/sub-users?service_type=${RESIDENTIAL}`,
      apiKey
    )
    if (!subUsers.ok) return subUsers
    if (!Array.isArray(subUsers.data)) return { ok: false, error: UNEXPECTED }
    // An empty list is a real 0 used: no sub-user has consumed anything.
    let used = 0
    for (const entry of subUsers.data) {
      const traffic = finiteOrNull(asRecord(entry)?.traffic)
      if (traffic === null) return { ok: false, error: UNEXPECTED }
      used += traffic
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "traffic",
          label: "Residential traffic",
          balance: Math.max(0, limit - used),
          balanceLimit: limit,
          unit: "gb",
        },
      ],
    }
  },
}
