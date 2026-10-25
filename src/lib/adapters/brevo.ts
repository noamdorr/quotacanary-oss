import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

// Hand-written because the balance lives in `plan[]`, one entry per plan type,
// in an order the docs never promise. An account with both a subscription and
// pay-as-you-go credits carries two email entries, so the catalog's positional
// `plan.0.credits` would read the wrong pool. Entries are picked by `type`.
const BREVO_ACCOUNT_URL = "https://api.brevo.com/v3/account"

const UNEXPECTED = "Brevo returned an unexpected response."

// `credits` is the "Remaining credits of the user" on every entry. Paid email
// credits (subscription, pay-as-you-go) are summed into one pool. The free
// plan's credits are what is left of its daily send allowance (300 a day), which
// resets, so it stays its own pool instead of inflating the paid balance.
const POOLS: { creditType: string; label: string; types: string[] }[] = [
  {
    creditType: "emails",
    label: "Email credits",
    types: ["subscription", "payAsYouGo"],
  },
  { creditType: "sms", label: "SMS credits", types: ["sms"] },
  { creditType: "free_emails", label: "Free daily emails", types: ["free"] },
]

type PlanEntry = { type?: unknown; credits?: unknown; creditsType?: unknown }

export const brevoAdapter: ToolAdapter = {
  toolId: "brevo",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(BREVO_ACCOUNT_URL, {
        headers: { Accept: "application/json", "api-key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach Brevo." }
    }
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Brevo rejected this key." }
    if (!res.ok) return { ok: false, error: `Brevo returned ${res.status}.` }

    let data: { plan?: unknown }
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: UNEXPECTED }
    }
    if (!Array.isArray(data?.plan)) return { ok: false, error: UNEXPECTED }
    // A `userLimit` entry counts seats or child accounts, not sends.
    const entries = (data.plan as unknown[]).filter(
      (entry): entry is PlanEntry =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as PlanEntry).creditsType !== "userLimit"
    )

    const balances: BalanceReading[] = []
    for (const pool of POOLS) {
      const matching = entries.filter(
        (entry) =>
          typeof entry.type === "string" && pool.types.includes(entry.type)
      )
      if (matching.length === 0) continue
      let balance = 0
      for (const entry of matching) {
        const credits = finiteOrNull(entry.credits)
        if (credits === null) return { ok: false, error: UNEXPECTED }
        balance += credits
      }
      balances.push({
        creditType: pool.creditType,
        label: pool.label,
        balance,
        balanceLimit: null,
        unit: "credits",
      })
    }
    if (balances.length === 0) return { ok: false, error: UNEXPECTED }
    return { ok: true, balances }
  },
}
