import { toFiniteNumber } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

export const emaillistverifyAdapter: ToolAdapter = {
  toolId: "emaillistverify",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await fetch("https://api.emaillistverify.com/api/credits", {
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
    const balances: BalanceReading[] = [
      {
        creditType: "ondemand",
        label: "Credits",
        balance: toFiniteNumber(data.onDemand?.available),
        balanceLimit: null,
        unit: "credits",
      },
    ]
    if (data.subscription && typeof data.subscription === "object") {
      balances.push({
        creditType: "subscription",
        label: "Daily Credits",
        balance: toFiniteNumber(data.subscription.available),
        balanceLimit: null,
        unit: "credits",
      })
    }
    return { ok: true, balances }
  },
}
