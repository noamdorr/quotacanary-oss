import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

export const myemailverifierAdapter: ToolAdapter = {
  toolId: "myemailverifier",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(
        `https://client.myemailverifier.com/verifier/getcredits/${encodeURIComponent(apiKey)}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach MyEmailVerifier." }
    }
    if (res.status === 401)
      return { ok: false, error: "MyEmailVerifier rejected this key." }
    if (!res.ok)
      return { ok: false, error: `MyEmailVerifier returned ${res.status}.` }

    let data: { Credits?: string | number }
    try {
      data = await res.json()
    } catch {
      return {
        ok: false,
        error: "MyEmailVerifier returned an unexpected response.",
      }
    }
    const balance = finiteOrNull(data.Credits)
    if (balance === null) {
      return {
        ok: false,
        error: "MyEmailVerifier returned an unexpected response.",
      }
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
