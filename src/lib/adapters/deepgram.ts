import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

// Hand-written because the catalog makes one request per tool: Deepgram keeps
// balances per project, so the read lists the projects the key can see, then
// fetches each project's balances and sums them. One pool per project, keyed
// by the discovered project id (never by position) so watched pools,
// thresholds and history survive a reorder.
const BASE_URL = "https://api.deepgram.com/v1/projects"
const UNEXPECTED = "Deepgram returned an unexpected response."

// A key belongs to one project, so a key that sees more than a handful is
// rare. The cap keeps one poll from fanning out into dozens of requests;
// projects past it (in the list's own order) are not read.
export const DEEPGRAM_MAX_PROJECTS = 10

type Fetched = { ok: true; data: unknown } | { ok: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

async function getJson(url: string, apiKey: string): Promise<Fetched> {
  let res: Response
  try {
    res = await timedFetch(url, {
      headers: { Authorization: `Token ${apiKey}`, Accept: "application/json" },
    })
  } catch {
    return { ok: false, error: "Couldn't reach Deepgram." }
  }
  // On a balances call, 401/403 means a key that can list projects but lacks
  // billing:read; the fix is the same new key, so the copy is the same.
  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "Deepgram rejected this key." }
  }
  if (!res.ok) return { ok: false, error: `Deepgram returned ${res.status}.` }
  try {
    return { ok: true, data: await res.json() }
  } catch {
    return { ok: false, error: UNEXPECTED }
  }
}

// Sums one project's USD balances. null = malformed or money in another unit
// (never silently dropped); 0 entries = no purchased balance (caller skips).
function sumUsd(data: unknown): { count: number; total: number } | null {
  const balances = asRecord(data)?.balances
  if (!Array.isArray(balances)) return null
  let total = 0
  for (const entry of balances) {
    const record = asRecord(entry)
    const units = record?.units
    if (typeof units !== "string" || units.toLowerCase() !== "usd") return null
    const amount = finiteOrNull(record?.amount)
    if (amount === null) return null
    total += amount
  }
  return { count: balances.length, total }
}

export const deepgramAdapter: ToolAdapter = {
  toolId: "deepgram",
  async readBalance(apiKey: string): Promise<AdapterResult> {
    const list = await getJson(BASE_URL, apiKey)
    if (!list.ok) return list
    const projects = asRecord(list.data)?.projects
    if (!Array.isArray(projects)) return { ok: false, error: UNEXPECTED }

    const balances: BalanceReading[] = []
    // Sequential on purpose: the first failure stops the read.
    for (const entry of projects.slice(0, DEEPGRAM_MAX_PROJECTS)) {
      const project = asRecord(entry)
      const id = project?.project_id
      if (typeof id !== "string" || !id.trim()) {
        return { ok: false, error: UNEXPECTED }
      }
      const name = typeof project?.name === "string" ? project.name.trim() : ""

      const fetched = await getJson(
        `${BASE_URL}/${encodeURIComponent(id)}/balances`,
        apiKey
      )
      if (!fetched.ok) return fetched
      const sum = sumUsd(fetched.data)
      if (!sum) return { ok: false, error: UNEXPECTED }
      if (sum.count === 0) continue

      balances.push({
        creditType: `project:${id}`,
        label: name || id.slice(0, 8),
        balance: sum.total,
        balanceLimit: null,
        unit: "usd",
      })
    }

    if (balances.length === 0) return { ok: false, error: UNEXPECTED }
    return { ok: true, balances }
  },
}
