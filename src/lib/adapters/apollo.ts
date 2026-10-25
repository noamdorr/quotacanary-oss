import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

type ApolloCreditStat = {
  limit?: unknown
  consumed?: unknown
  left_over?: unknown
}

type ApolloResponse = {
  credit_usage_stats?: unknown
}

// Apollo reports dialer talk time in minutes, not credits
// (docs.apollo.io/reference/view-credit-usage-stats). Every other key is credits.
const DIALER_CREDIT_TYPE = "dialer"

// The label is Apollo's own credit-type key, humanized - not a friendlier name
// invented here. Only casing that a naive title-case gets wrong is overridden.
const WORD_CASING: Record<string, string> = { ai: "AI" }

function toLabel(creditType: string): string {
  if (creditType === DIALER_CREDIT_TYPE) return "Dialer Minutes"

  const words = creditType
    .replace(/_credit$/, "")
    .split("_")
    .filter(Boolean)
  if (words.length === 0) return creditType

  const titled = words.map(
    (word) => WORD_CASING[word] ?? word[0].toUpperCase() + word.slice(1)
  )
  return `${titled.join(" ")} Credits`
}

function toReading(
  creditType: string,
  stat: ApolloCreditStat
): BalanceReading | null {
  const balanceLimit = finiteOrNull(stat.limit)
  // Apollo always returns every credit type; one the plan doesn't include comes
  // back with a limit of 0. Those are noise on the dashboard, so drop them.
  if (balanceLimit === 0) return null

  const leftOver = finiteOrNull(stat.left_over)
  const consumed = finiteOrNull(stat.consumed)
  const balance =
    leftOver ??
    (balanceLimit !== null && consumed !== null
      ? Math.max(balanceLimit - consumed, 0)
      : null)
  if (balance === null) return null

  return {
    creditType,
    label: toLabel(creditType),
    balance,
    balanceLimit,
    unit: creditType === DIALER_CREDIT_TYPE ? "minutes" : "credits",
  }
}

export const apolloAdapter: ToolAdapter = {
  toolId: "apollo",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      // Apollo exposes this read-only endpoint as a POST that takes no
      // parameters. It costs 0 credits and reads nothing but the team's own
      // credit totals. The empty body is what was verified against a live
      // account, so it stays empty rather than carrying a token JSON object.
      res = await timedFetch(
        "https://api.apollo.io/api/v1/usage_stats/credit_usage_stats",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "x-api-key": apiKey,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Apollo." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Apollo rejected this key." }
    }
    if (!res.ok) return { ok: false, error: `Apollo returned ${res.status}.` }

    let data: ApolloResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Apollo returned an unexpected response." }
    }

    const stats = data.credit_usage_stats
    if (typeof stats !== "object" || stats === null) {
      return { ok: false, error: "Apollo returned an unexpected response." }
    }

    // Derived from whatever the response carries rather than a hardcoded list,
    // so a credit type Apollo adds later still reports without a code change.
    const balances = Object.entries(stats as Record<string, unknown>)
      .map(([creditType, stat]) =>
        typeof stat === "object" && stat !== null
          ? toReading(creditType, stat as ApolloCreditStat)
          : null
      )
      .filter((reading): reading is BalanceReading => reading !== null)

    if (balances.length === 0) {
      return { ok: false, error: "Apollo returned an unexpected response." }
    }

    return { ok: true, balances }
  },
}
