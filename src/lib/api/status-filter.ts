import type { PoolPayload } from "./serialize"

// "disconnected" is deliberately absent: the app never writes that status, so
// it is not an accepted filter value. It stays in the PoolPayload type only
// for tolerance of manually-set DB rows.
export const KNOWN_STATUSES: PoolPayload["status"][] = [
  "healthy",
  "low",
  "critical",
  "stale",
  "error",
  "nodata",
]

const KNOWN_STATUS_SET = new Set<string>(KNOWN_STATUSES)

export type StatusFilterResult =
  | { ok: true; statuses: Set<PoolPayload["status"]> | null }
  | { ok: false }

// Parses a comma-separated status filter query param.
// null/empty -> no filter ({ ok: true, statuses: null }).
// Validates each value against the known set; any unknown -> { ok: false }.
export function parseStatusFilter(value: string | null): StatusFilterResult {
  if (value === null || value.trim() === "") {
    return { ok: true, statuses: null }
  }

  const parts = value.split(",").map((s) => s.trim())
  const statuses = new Set<PoolPayload["status"]>()

  for (const part of parts) {
    if (!KNOWN_STATUS_SET.has(part)) return { ok: false }
    statuses.add(part as PoolPayload["status"])
  }

  return { ok: true, statuses }
}
