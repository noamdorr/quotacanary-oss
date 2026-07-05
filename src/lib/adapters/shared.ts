// Coerces an unknown API value to a finite number, falling back when it isn't one.
export function toFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// Parses an unknown API value to a finite number, or null when it isn't one.
// Use for a primary balance so an absent, null, or non-numeric field becomes an
// unexpected-response error instead of a false zero. A present 0 stays 0.
export function finiteOrNull(value: unknown): number | null {
  // Number(null) and Number("") are both 0 (finite), so without this guard an
  // explicit null or empty-string field would read as a real 0 - the exact
  // false zero this helper exists to prevent. Treat them as a missing field.
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Wraps fetch with a hard timeout so one hung vendor can't stall the whole
// sequential poll cron. A timeout aborts the request (throws), which the
// adapter's existing try/catch turns into a clean error status.
export function timedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 10000
): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}
