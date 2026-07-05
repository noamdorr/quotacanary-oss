import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

export const emaillistverifyAdapter: ToolAdapter = {
  toolId: "emaillistverify",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch("https://api.emaillistverify.com/api/credits", {
        headers: { "x-api-key": apiKey },
      })
    } catch {
      return { ok: false, error: "Couldn't reach EmailListVerify." }
    }
    if (res.status === 401)
      return { ok: false, error: "EmailListVerify rejected this key." }
    if (!res.ok)
      return { ok: false, error: `EmailListVerify returned ${res.status}.` }

    let data: {
      onDemand?: { available?: number }
      subscription?: { available?: number } | null
    }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "EmailListVerify returned an unexpected response.",
      }
    }
    const onDemand = finiteOrNull(data.onDemand?.available)
    if (onDemand === null) {
      return {
        ok: false,
        error: "EmailListVerify returned an unexpected response.",
      }
    }
    const balances: BalanceReading[] = [
      {
        creditType: "ondemand",
        label: "Credits",
        balance: onDemand,
        balanceLimit: null,
        unit: "credits",
      },
    ]
    if (data.subscription && typeof data.subscription === "object") {
      const subscription = finiteOrNull(data.subscription.available)
      if (subscription !== null) {
        balances.push({
          creditType: "subscription",
          label: "Daily Credits",
          balance: subscription,
          balanceLimit: null,
          unit: "credits",
        })
      }
    }
    return { ok: true, balances }
  },
}
