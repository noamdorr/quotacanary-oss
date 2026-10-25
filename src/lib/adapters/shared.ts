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
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((err: unknown) => {
    // Every adapter catches this throw and maps it to a generic
    // "Couldn't reach X." that renders in the UI, so the real cause
    // (timeout vs DNS vs reset) survives only here. Log the host, never
    // the URL - some vendors carry the API key in query params.
    let host = "unknown-host"
    try {
      host = new URL(input instanceof Request ? input.url : String(input)).host
    } catch {}
    const cause =
      err instanceof Error
        ? ((err.cause as { code?: string } | undefined)?.code ?? err.name)
        : String(err)
    console.error(`[fetch] ${host} failed: ${cause}`)
    throw err
  })
}

// Reads a two-value credential (credential_fields with two entries). Accepts
// the JSON object `buildCredentialSecret` stores, keyed by field name, and the
// `first:second` compatibility form DataForSEO also takes. Returns null when
// either value is missing or blank; the caller owns the error copy.
export function credentialPair(
  secret: string,
  first: string,
  second: string
): [string, string] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(secret)
  } catch {
    const separator = secret.indexOf(":")
    if (separator <= 0) return null
    const a = secret.slice(0, separator).trim()
    const b = secret.slice(separator + 1).trim()
    return a && b ? [a, b] : null
  }
  const record = (parsed ?? {}) as Record<string, unknown>
  const rawA = record[first]
  const rawB = record[second]
  const a = typeof rawA === "string" ? rawA.trim() : ""
  const b = typeof rawB === "string" ? rawB.trim() : ""
  return a && b ? [a, b] : null
}
