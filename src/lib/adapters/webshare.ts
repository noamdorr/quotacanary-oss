import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

// Hand-written because the catalog makes one request per tool: remaining
// traffic is the active plan's bandwidth cap minus the bytes used this
// subscription period, which takes three sequential reads. The subscription
// names the active plan and the period start, the plan holds the cap, and the
// stats aggregate holds the usage. On an unlimited plan the aggregate call is
// skipped.
const BASE_URL = "https://proxy.webshare.io/api/v2"
const UNEXPECTED = "Webshare returned an unexpected response."
const NOTHING_TO_WATCH = "Webshare has no capped traffic or credits to watch."

// The aggregate endpoint rejects a window that starts more than 90 days ago.
// Periods are 30 days per the docs, so a clamp means a stale subscription;
// the reading then counts usage from the clamp only (it can overstate the
// balance, never report a false zero).
const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const BYTES_PER_GB = 1e9

type Fetched =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

async function getJson(url: string, apiKey: string): Promise<Fetched> {
  let res: Response
  try {
    res = await timedFetch(url, {
      headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
    })
  } catch {
    return { ok: false, error: "Couldn't reach Webshare." }
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Webshare rejected this key." }
  }
  if (!res.ok) return { ok: false, error: `Webshare returned ${res.status}.` }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { ok: false, error: UNEXPECTED }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: UNEXPECTED }
  }
  return { ok: true, data: data as Record<string, unknown> }
}

export const webshareAdapter: ToolAdapter = {
  toolId: "webshare",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    const subscription = await getJson(`${BASE_URL}/subscription/`, apiKey)
    if (!subscription.ok) return subscription
    const planId = subscription.data.plan
    const freeCredits = finiteOrNull(subscription.data.free_credits)
    if (typeof planId !== "number" || !Number.isInteger(planId)) {
      return { ok: false, error: UNEXPECTED }
    }
    if (freeCredits === null) return { ok: false, error: UNEXPECTED }

    const plan = await getJson(
      `${BASE_URL}/subscription/plan/${planId}/`,
      apiKey
    )
    if (!plan.ok) return plan
    const bandwidthLimit = finiteOrNull(plan.data.bandwidth_limit)
    if (bandwidthLimit === null) return { ok: false, error: UNEXPECTED }

    const balances: BalanceReading[] = []
    // bandwidth_limit is in GB and 0 means unlimited: no traffic pool then.
    if (bandwidthLimit > 0) {
      const start = Date.parse(String(subscription.data.start_date))
      if (Number.isNaN(start)) return { ok: false, error: UNEXPECTED }
      const now = Date.now()
      const from = Math.max(start, now - MAX_WINDOW_MS)
      if (from >= now) return { ok: false, error: UNEXPECTED }
      // ISO strings carry only query-safe characters, so no encoding.
      const gte = new Date(from).toISOString()
      const lte = new Date(now).toISOString()
      const stats = await getJson(
        `${BASE_URL}/stats/aggregate/?timestamp__gte=${gte}&timestamp__lte=${lte}`,
        apiKey
      )
      if (!stats.ok) return stats
      // bandwidth_total is in bytes.
      const usedBytes = finiteOrNull(stats.data.bandwidth_total)
      if (usedBytes === null) return { ok: false, error: UNEXPECTED }
      balances.push({
        creditType: "traffic",
        label: "Traffic",
        balance: Math.max(0, bandwidthLimit - usedBytes / BYTES_PER_GB),
        balanceLimit: bandwidthLimit,
        unit: "gb",
      })
    }
    if (freeCredits > 0) {
      balances.push({
        creditType: "free_credits",
        label: "Free credits",
        balance: freeCredits,
        balanceLimit: null,
        unit: "usd",
      })
    }

    if (balances.length === 0) return { ok: false, error: NOTHING_TO_WATCH }
    return { ok: true, balances }
  },
}
