import { createHash, randomBytes } from "node:crypto"
import { keyHint } from "@/lib/crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { after } from "next/server"

// SHA-256 hex of the raw token. One-way: we never store or reverse the raw
// token, only this hash. (Distinct from lib/crypto.ts, which does reversible
// AES for third-party API keys.)
export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export function generateApiToken(): {
  raw: string
  hash: string
  hint: string
} {
  const raw = `qc_live_${randomBytes(32).toString("base64url")}`
  return { raw, hash: hashApiToken(raw), hint: keyHint(raw) }
}

// Fixed-window rate limit applied per token: RATE_LIMIT requests per
// RATE_WINDOW_SECONDS. Exported so routes/docs can quote the policy.
export const RATE_LIMIT = 60
export const RATE_WINDOW_SECONDS = 60

// Looks up a raw token via the service-role admin client (the caller has no
// Supabase session, so RLS would hide the row). Returns the owning user id,
// token id and scopes, or null if the token is unknown or revoked.
export async function verifyApiTokenByRaw(
  raw: string
): Promise<{ userId: string; tokenId: string; scopes: string[] } | null> {
  const hash = hashApiToken(raw)
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, user_id, revoked_at, scopes")
    .eq("token_hash", hash)
    .maybeSingle()

  // Fail closed on a lookup error (auth must never fail open), but log it so
  // a DB outage is distinguishable from a flood of bad tokens.
  if (error) console.warn("api_tokens lookup failed:", error.message)
  if (!data || data.revoked_at) return null

  // Touch last_used_at off the hot path so it never blocks verification.
  after(async () => {
    await supabase
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
  })

  return {
    userId: data.user_id,
    tokenId: data.id,
    scopes: (data.scopes as string[] | null) ?? [],
  }
}

export async function verifyApiToken(
  req: Request
): Promise<{ userId: string; tokenId: string; scopes: string[] } | null> {
  const header = req.headers.get("authorization")
  // RFC 7235: the auth scheme name is case-insensitive.
  const match = header?.match(/^bearer\s+(.+)$/i)
  if (!match) return null
  const raw = match[1]
  if (!raw.startsWith("qc_live_")) return null
  return verifyApiTokenByRaw(raw)
}

// Atomically consumes one unit of the per-token fixed-window budget via the
// Postgres limiter, keyed on token id. Returns whether the request is allowed
// plus the remaining budget and seconds until the window resets (null when the
// limiter could not report them).
export async function consumeRateLimit(tokenId: string): Promise<{
  allowed: boolean
  remaining: number | null
  resetSeconds: number | null
}> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc("consume_api_rate_limit_v2", {
    p_token_id: tokenId,
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })

  // The function returns a set, which Supabase surfaces as an array of rows.
  const row = Array.isArray(data) ? data[0] : data

  // Fail open: a DB/limiter hiccup should not 429 the entire read API. The
  // tradeoff is that an outage temporarily removes the cap rather than blocking
  // all traffic. We log so a persistent outage (or an unapplied 042 migration)
  // is observable in logs rather than a silent no-op.
  if (error || !row) {
    console.warn(
      "consume_api_rate_limit_v2 rpc failed; allowing request:",
      error?.message ?? "no row returned"
    )
    return { allowed: true, remaining: null, resetSeconds: null }
  }
  return {
    allowed: row.allowed === true,
    remaining: row.remaining,
    resetSeconds: row.reset_seconds,
  }
}
