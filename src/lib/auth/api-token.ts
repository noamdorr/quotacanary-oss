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
// Supabase session, so RLS would hide the row). Returns the owning user id and
// token id, or null if the token is unknown or revoked.
export async function verifyApiTokenByRaw(
  raw: string
): Promise<{ userId: string; tokenId: string } | null> {
  const hash = hashApiToken(raw)
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("api_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle()

  if (!data || data.revoked_at) return null

  // Touch last_used_at off the hot path so it never blocks verification.
  after(async () => {
    await supabase
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
  })

  return { userId: data.user_id, tokenId: data.id }
}

export async function verifyApiToken(
  req: Request
): Promise<{ userId: string; tokenId: string } | null> {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) return null
  const raw = header.slice("Bearer ".length)
  if (!raw.startsWith("qc_live_")) return null
  return verifyApiTokenByRaw(raw)
}

// Atomically consumes one unit of the per-token fixed-window budget via the
// Postgres limiter, keyed on token id. Returns true if the request is allowed.
export async function consumeRateLimit(tokenId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_token_id: tokenId,
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })

  // Fail open: a DB/limiter hiccup should not 429 the entire read API. The
  // tradeoff is that an outage temporarily removes the cap rather than blocking
  // all traffic. We log so a persistent outage (or an unapplied 028 migration)
  // is observable in logs rather than a silent no-op.
  if (error) {
    console.warn(
      "consume_api_rate_limit rpc failed; allowing request:",
      error.message
    )
    return true
  }
  return data === true
}
