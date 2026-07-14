import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type ErrorResponse = {
  error?: unknown
  message?: unknown
}

function errorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null

  const error = (data as ErrorResponse).error
  const message = (data as ErrorResponse).message
  if (typeof error === "string") return error
  if (typeof message === "string") return message
  return null
}

async function readJson(res: Response): Promise<unknown | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export const keywordseverywhereAdapter: ToolAdapter = {
  toolId: "keywordseverywhere",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    let res: Response
    try {
      res = await timedFetch(
        "https://api.keywordseverywhere.com/v1/account/credits",
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        }
      )
    } catch {
      return { ok: false, error: "Couldn't reach Keywords Everywhere." }
    }

    if (res.status === 401) {
      return { ok: false, error: "Keywords Everywhere rejected this key." }
    }

    const data = await readJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error:
          errorMessage(data) ?? `Keywords Everywhere returned ${res.status}.`,
      }
    }
    if (!data || !Array.isArray(data)) {
      return {
        ok: false,
        error: "Keywords Everywhere returned an unexpected response.",
      }
    }

    const balance = finiteOrNull(data[0])
    if (balance === null) {
      return {
        ok: false,
        error: "Keywords Everywhere returned an unexpected response.",
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
