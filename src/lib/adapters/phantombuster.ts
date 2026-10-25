import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

// Hand-written because the balances are derived, not read: each pool is a plan
// limit minus a counter, plus a sum over an array of top-up lots, and the
// direction of the counters needs a guard. The catalog reads one JSON path per
// pool and can neither subtract nor reduce an array.
//
// HYPOTHESIS (not yet confirmed by a live response, QUO-229): the top-level
// counters (`monthlyExecutionTime`, `monthlyAiCredit`, `monthlyMail`) are
// USAGE this cycle, so remaining = plan limit - counter. The schema documents
// an explicit "remaining" only on top-up lots, which is the evidence for it.
// A counter above its plan limit means the guess is wrong (or the plan changed
// mid-cycle), so the read fails instead of reporting a negative balance.
const PHANTOMBUSTER_URL =
  "https://api.phantombuster.com/api/v2/orgs/fetch-resources"
const UNEXPECTED = "PhantomBuster returned an unexpected response."

type PoolSpec = {
  creditType: string
  label: string
  unit: BalanceReading["unit"]
  planField: string
  counterField: string
  topUpField: string | null
}

// The schema states no unit for execution time; minutes is assumed (flagged
// in the wiki note, with the probe that settles it).
const POOLS: PoolSpec[] = [
  {
    creditType: "execution_time",
    label: "Execution time",
    unit: "minutes",
    planField: "monthlyExecutionTime",
    counterField: "monthlyExecutionTime",
    topUpField: null,
  },
  {
    creditType: "ai_credits",
    label: "AI credits",
    unit: "credits",
    planField: "monthlyAiCredits",
    counterField: "monthlyAiCredit",
    topUpField: "aiCredits",
  },
  {
    creditType: "emails",
    label: "Emails",
    unit: "credits",
    planField: "monthlyMails",
    counterField: "monthlyMail",
    topUpField: "emailCredits",
  },
]

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

// Sums the lots of one resource. A lot whose `remaining` or `amount` is not a
// number is skipped whole, so remaining never outgrows the limit. `expiresAt`
// is ignored: the schema says the list holds only valid top-ups.
function sumTopUps(lots: unknown): { remaining: number; amount: number } {
  let remaining = 0
  let amount = 0
  if (!Array.isArray(lots)) return { remaining, amount }
  for (const lot of lots) {
    const record = asRecord(lot)
    const lotRemaining = finiteOrNull(record?.remaining)
    const lotAmount = finiteOrNull(record?.amount)
    if (lotRemaining === null || lotAmount === null) continue
    remaining += lotRemaining
    amount += lotAmount
  }
  return { remaining, amount }
}

export const phantombusterAdapter: ToolAdapter = {
  toolId: "phantombuster",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // The org comes from the key, so no X-Phantombuster-Org header.
      res = await timedFetch(PHANTOMBUSTER_URL, {
        headers: {
          "X-Phantombuster-Key": apiKey,
          Accept: "application/json",
        },
      })
    } catch {
      return { ok: false, error: "Couldn't reach PhantomBuster." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "PhantomBuster rejected this key." }
    }
    if (!res.ok) {
      return { ok: false, error: `PhantomBuster returned ${res.status}.` }
    }

    let data: Record<string, unknown> | null
    try {
      data = asRecord(await res.json())
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    const plan = asRecord(data?.plan)
    if (!data || !plan) return { ok: false, error: UNEXPECTED }
    const topUps = asRecord(data.topUps)

    const balances: BalanceReading[] = []
    for (const spec of POOLS) {
      const planLimit = finiteOrNull(plan[spec.planField])
      // Missing or 0: the plan does not include this resource.
      if (planLimit === null || planLimit === 0) continue

      const used = finiteOrNull(data[spec.counterField])
      // Missing, negative, or above the limit: not the usage counter we assume.
      if (used === null || used < 0 || used > planLimit) {
        return { ok: false, error: UNEXPECTED }
      }

      const lots = spec.topUpField ? sumTopUps(topUps?.[spec.topUpField]) : null
      balances.push({
        creditType: spec.creditType,
        label: spec.label,
        balance: planLimit - used + (lots?.remaining ?? 0),
        balanceLimit: planLimit + (lots?.amount ?? 0),
        unit: spec.unit,
      })
    }

    if (balances.length === 0) return { ok: false, error: UNEXPECTED }
    return { ok: true, balances }
  },
}
