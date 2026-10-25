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

// Tokens are the rate-limit key above: with no ceiling, minting and rotating
// tokens multiplies one account's effective request budget (QUO-62). Lives
// here rather than actions/api-tokens.ts because that file is "use server" -
// every export from one must be an async function, so a plain constant there
// silently drops the module's exports at build time (see QUO-63 for the same
// constraint biting a different export).
export const MAX_ACTIVE_TOKENS_PER_USER = 10

// Scope vocabulary. "read" lists pools over REST and MCP; "write" adds
// connection create, rekey, rename and remove over REST (QUO-187). A write
// token always carries read as well, so one pasted token covers the Mac app's
// whole connected mode: it reads pools back through the same token it moved
// them with.
export const API_TOKEN_SCOPES = ["read", "write"] as const
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]

// Maps the creation form's scope choice to the scopes stored on the token.
// Null for anything outside the vocabulary; the caller refuses rather than
// defaulting, so a mistyped form value never silently mints a token.
export function scopesForChoice(choice: string): ApiTokenScope[] | null {
  if (choice === "read") return ["read"]
  if (choice === "write") return ["read", "write"]
  return null
}

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

// Whether an RPC error means the limiter itself is misconfigured, not merely
// hiccuping. PGRST202 is PostgREST's own "function not found in schema cache"
// (an unapplied 042 migration). SQLSTATE class 42 ("Syntax Error or Access
// Rule Violation") covers the raw Postgres side of the same failure mode -
// 42883 undefined_function, 42501 insufficient_privilege, 42P01
// undefined_table, 42703 undefined_column, and siblings - all structural,
// never transient (unlike class 08 connection or 57 operator-intervention
// errors). Either means a self-hoster's deployment is wrong, not that the DB
// blipped - fail closed instead of silently removing the cap.
function isMisconfiguredRpcError(code: string | undefined): boolean {
  return code === "PGRST202" || (code?.startsWith("42") ?? false)
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

  if (error && isMisconfiguredRpcError(error.code)) {
    console.error(
      "consume_api_rate_limit_v2 rpc misconfigured; denying request:",
      error.code,
      error.message
    )
    return { allowed: false, remaining: 0, resetSeconds: RATE_WINDOW_SECONDS }
  }

  // Fail open: a DB/limiter hiccup should not 429 the entire read API. The
  // tradeoff is that an outage temporarily removes the cap rather than blocking
  // all traffic. We log so a persistent outage is observable rather than a
  // silent no-op.
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
