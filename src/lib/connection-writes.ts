import { getAdapter } from "@/lib/adapters/registry"
import { buildCredentialSecret } from "@/lib/credentials"
import { decrypt, encrypt, keyHint } from "@/lib/crypto"
import type { CredentialField, PoolDef, PoolThresholds } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"

// Connection writes keyed on an explicit user id, shared by the web server
// actions (src/lib/actions/connections.ts, session client + auth.uid()) and
// the token-authenticated REST endpoints (src/app/api/v1/connections, service
// role + the token's user id). The caller owns authentication and cache
// invalidation; this module owns validation, vendor checks, encryption and
// the owner-scoped queries. QUO-187.

export type WriteErrorCode =
  | "invalid"
  | "unsupported_tool"
  | "key_rejected"
  | "not_found"
  | "db"

export type WriteFailure = { ok: false; code: WriteErrorCode; error: string }
export type WriteResult = { ok: true } | WriteFailure

export const NAME_TOO_LONG = "That name is too long (80 characters max)."
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function fail(code: WriteErrorCode, error: string): WriteFailure {
  return { ok: false, code, error }
}

// A credential arrives either as a form (one entry per declared credential
// field, validated against the tool's definition) or as the finished secret
// string, which skips field validation. The string form is what key rotation
// has always accepted and what the API's `apiKey` maps to.
export type ConnectionCredential = FormData | string

export function buildCredentialFromInput(
  fields: CredentialField[] | null | undefined,
  input: ConnectionCredential
):
  | { ok: true; secret: string; hintValue: string }
  | { ok: false; error: string } {
  if (typeof input !== "string") return buildCredentialSecret(fields, input)

  const secret = input.trim()
  if (!secret) return { ok: false, error: "Credentials are required." }
  return { ok: true, secret, hintValue: secret }
}

export type ConnectionDraft = {
  toolId: string
  name: string
  tags: string[]
  watchedCreditTypes: string[]
  credential: ConnectionCredential
  // Already shape-checked (parsePoolThresholds); the credit types are checked
  // against the tool here. Only the API's move sends them (QUO-291).
  poolThresholds?: PoolThresholds
}

type BalanceReading = {
  creditType: string
  label: string
  balance: number
  balanceLimit: number | null
  unit: string
}

// Everything the insert needs, produced only after the tool, the inputs and
// the key itself (one live balance read) have checked out.
export type PreparedConnection = {
  toolId: string
  name: string
  tags: string[]
  watched: string[] | null
  encryptedKey: string
  keyHint: string
  balances: BalanceReading[]
  // Balance thresholds to seed onto the new row, or null (QUO-291).
  poolThresholds?: PoolThresholds | null
  // The watched pools' readings (all readings when nothing is watched), so a
  // multi-pool connect reports exactly what is now being tracked.
  summary: { balance: number; label: string; unit: string }[]
}

export async function prepareConnection(
  supabase: SupabaseClient,
  draft: ConnectionDraft
): Promise<{ ok: true; prepared: PreparedConnection } | WriteFailure> {
  const { toolId, tags } = draft
  const name = draft.name.trim()
  const watched = draft.watchedCreditTypes.filter(Boolean)

  if (!toolId || !name) return fail("invalid", "Missing required fields.")
  if (name.length > 80) return fail("invalid", NAME_TOO_LONG)
  if (tags.length > 20) return fail("invalid", "Too many tags (20 max).")
  if (tags.some((t) => t.length > 40))
    return fail("invalid", "Tags must be 40 characters or fewer.")

  const { data: tool } = await supabase
    .from("tools")
    .select("credential_fields, pools")
    .eq("id", toolId)
    .single()

  // A missing tool row declares no pools; the adapter lookup below still
  // rejects unknown tools.
  const pools = (tool?.pools as PoolDef[] | null) ?? []
  // Only tools without a multi-pool picker use the implicit watch-all default.
  if (pools.length > 1 && watched.length === 0)
    return fail("invalid", "Choose at least one balance to track.")
  if (watched.length > 20)
    return fail("invalid", "Unknown credit pool for this tool.")

  const credential = buildCredentialFromInput(
    (tool?.credential_fields as CredentialField[] | null) ?? null,
    draft.credential
  )
  if (!credential.ok) return fail("invalid", credential.error)

  const adapter = getAdapter(toolId)
  if (!adapter)
    return fail("unsupported_tool", "This tool isn't supported yet.")

  // Validate by performing ONE live balance read (spec §4.4).
  const result = await adapter.readBalance(credential.secret)
  if (!result.ok) return fail("key_rejected", result.error)

  // A watched type or a threshold may name a declared pool or any balance the
  // key reports (tools with no pools row read their balances live), so a
  // moved Mac connection keeps an extra it watches (QUO-286).
  const known = new Set([
    ...pools.map((p) => p.credit_type),
    ...result.balances.map((b) => b.creditType),
  ])
  if (!watched.every((w) => known.has(w)))
    return fail("invalid", "Unknown credit pool for this tool.")
  if (
    draft.poolThresholds &&
    !Object.keys(draft.poolThresholds).every((c) => known.has(c))
  )
    return fail("invalid", "Unknown credit pool for this tool.")

  const watchedReadings =
    watched.length > 0
      ? result.balances.filter((b) => watched.includes(b.creditType))
      : result.balances
  const summary = watchedReadings.length > 0 ? watchedReadings : result.balances

  return {
    ok: true,
    prepared: {
      toolId,
      name,
      tags,
      watched: watched.length > 0 ? watched : null,
      encryptedKey: encrypt(credential.secret),
      keyHint: keyHint(credential.hintValue),
      balances: result.balances,
      poolThresholds: draft.poolThresholds ?? null,
      summary: summary.map((b) => ({
        balance: b.balance,
        label: b.label,
        unit: b.unit,
      })),
    },
  }
}

function insertParams(prepared: PreparedConnection, createRequestId: string) {
  return {
    p_tool_id: prepared.toolId,
    p_encrypted_key: prepared.encryptedKey,
    p_key_hint: prepared.keyHint,
    p_name: prepared.name,
    p_tags: prepared.tags,
    p_watched_credit_types: prepared.watched,
    p_balances: prepared.balances.map((balance) => ({
      credit_type: balance.creditType,
      label: balance.label,
      balance: balance.balance,
      balance_limit: balance.balanceLimit,
      unit: balance.unit,
    })),
    p_create_request_id: createRequestId,
  }
}

export type InsertResult =
  | { ok: true; connectionId: string }
  | (WriteFailure & { code: "db" })

const SAVE_FAILED = "Couldn't save the connection. Please try again."

// Web flow: the session client calls the 046 RPC, which derives the owner
// from auth.uid() and holds the per-user request id for idempotent retries.
export async function insertConnection(
  supabase: SupabaseClient,
  prepared: PreparedConnection,
  createRequestId: string
): Promise<InsertResult> {
  const { data: connectionId, error } = await supabase.rpc(
    "create_connection_with_balances",
    insertParams(prepared, createRequestId)
  )
  if (error || typeof connectionId !== "string")
    return { ok: false, code: "db", error: SAVE_FAILED }
  return { ok: true, connectionId }
}

// API flow: there is no session, so the service-role client calls the 070
// variant with the token's user id. Executable by service_role only, so a
// signed-in user cannot reach it with someone else's id.
export async function insertConnectionForUser(
  admin: SupabaseClient,
  userId: string,
  prepared: PreparedConnection,
  createRequestId: string
): Promise<InsertResult> {
  const { data: connectionId, error } = await admin.rpc(
    "create_connection_with_balances_for_user",
    { p_user_id: userId, ...insertParams(prepared, createRequestId) }
  )
  if (error || typeof connectionId !== "string")
    return { ok: false, code: "db", error: SAVE_FAILED }
  return { ok: true, connectionId }
}

// Seeds a just-created connection's balance thresholds (QUO-291). The 070
// insert takes none, so this is a follow-up write, and only onto a row that
// has no pool_thresholds yet: it can never drop or overwrite another
// balance's number (the QUO-165 rule).
export async function seedPoolThresholds(
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  thresholds: PoolThresholds
): Promise<WriteResult> {
  const { error } = await admin
    .from("connections")
    .update({
      pool_thresholds: thresholds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .is("pool_thresholds", null)
  if (error) return fail("db", "Couldn't save the thresholds.")
  return { ok: true }
}

// The connection an earlier request with this id already created for userId,
// or null. Lets a retried "Move to account" answer before a second vendor
// check (QUO-290). A failed read also returns null: the caller then takes the
// normal path, whose insert is idempotent on the same id anyway.
export async function findConnectionByRequestId(
  admin: SupabaseClient,
  userId: string,
  createRequestId: string
): Promise<string | null> {
  const { data } = await admin
    .from("connections")
    .select("id")
    .eq("user_id", userId)
    .eq("create_request_id", createRequestId)
    .maybeSingle()
  return typeof data?.id === "string" ? data.id : null
}

export type ExistingConnection = { connectionId: string; name: string }

// A multi-field credential is a JSON object; compare it field by field so key
// order never makes the same credential look new.
function sameCredential(a: string, b: string): boolean {
  if (a === b) return true
  const x = parseObject(a)
  const y = parseObject(b)
  if (!x || !y) return false
  const keys = Object.keys(x)
  return (
    keys.length === Object.keys(y).length && keys.every((k) => x[k] === y[k])
  )
}

function parseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null
  } catch {
    return null
  }
}

// The user's connection to this tool that already holds this exact
// credential, or null (QUO-293). Keys are encrypted with a random IV, so the
// candidates are decrypted and compared here, before any vendor read. Every
// connection the user has for the tool is a candidate, not only those with
// the same key hint: a multi-field credential sent as a finished string gets
// a different hint than the same one built from the form. `admin` because
// `authenticated` cannot read ciphertext. The row `requestId` itself created
// is skipped, so a retried create stays the idempotent RPC's to answer. A row
// that will not decrypt is skipped, and a bad credential returns null for the
// normal path to reject.
export async function findConnectionWithSameKey(
  admin: SupabaseClient,
  userId: string,
  toolId: string,
  input: ConnectionCredential,
  requestId?: string
): Promise<ExistingConnection | null> {
  const [{ data: tool }, { data: rows }] = await Promise.all([
    admin.from("tools").select("credential_fields").eq("id", toolId).single(),
    admin
      .from("connections")
      .select("id, name, encrypted_key, create_request_id")
      .eq("user_id", userId)
      .eq("tool_id", toolId),
  ])
  if (!rows?.length) return null
  const credential = buildCredentialFromInput(
    (tool?.credential_fields as CredentialField[] | null) ?? null,
    input
  )
  if (!credential.ok) return null
  for (const row of rows as {
    id: string
    name: string
    encrypted_key: string
    create_request_id: string | null
  }[]) {
    if (requestId && row.create_request_id === requestId) continue
    let secret: string
    try {
      secret = decrypt(row.encrypted_key)
    } catch {
      continue
    }
    if (sameCredential(secret, credential.secret))
      return { connectionId: row.id, name: row.name }
  }
  return null
}

// True when the connection exists and belongs to userId. The API answers 404
// either way, so a caller probing ids learns nothing about other accounts.
export async function findOwnedConnection(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<boolean> {
  if (!UUID_PATTERN.test(connectionId)) return false
  const { data } = await supabase
    .from("connections")
    .select("id")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle()
  return Boolean(data)
}

export async function renameOwnedConnection(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  name: string
): Promise<WriteResult> {
  const trimmed = name.trim()
  if (!trimmed) return fail("invalid", "Name can't be empty.")
  if (trimmed.length > 80) return fail("invalid", NAME_TOO_LONG)
  const { error } = await supabase
    .from("connections")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", userId)
  if (error) return fail("db", "Couldn't rename.")
  return { ok: true }
}

// `reader` does the owner-scoped lookup (the session client on the web, so
// RLS stays the primary guard); `admin` does the privileged ciphertext write,
// which `authenticated` lost in migration 065.
export async function rekeyOwnedConnection(
  reader: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  credentials: ConnectionCredential
): Promise<WriteResult> {
  const { data: conn } = await reader
    .from("connections")
    .select("tool_id, tool:tools(credential_fields)")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .single()
  if (!conn) return fail("not_found", "Connection not found.")
  const adapter = getAdapter(conn.tool_id)
  if (!adapter) return fail("unsupported_tool", "Unsupported tool.")
  // biome-ignore lint/suspicious/noExplicitAny: Supabase embedded-select rows are untyped here
  const tool = (conn as any).tool as {
    credential_fields: CredentialField[] | null
  } | null
  const credential = buildCredentialFromInput(
    tool?.credential_fields,
    credentials
  )
  if (!credential.ok) return fail("invalid", credential.error)
  const check = await adapter.readBalance(credential.secret)
  if (!check.ok) return fail("key_rejected", check.error)
  // Existing ciphertext has no authenticated UPDATE grant after 065. Escalate after
  // authentication, the owner-scoped lookup, and adapter validation above.
  // Keep the owner/tool filters on the privileged write, including if the row
  // changes or disappears while the vendor request is in flight.
  const { data: updated, error } = await admin
    .from("connections")
    .update({
      encrypted_key: encrypt(credential.secret),
      key_hint: keyHint(credential.hintValue),
      status: "active",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .eq("tool_id", conn.tool_id)
    .select("id")
    .single()
  if (error || !updated) return fail("db", "Couldn't update the key.")
  return { ok: true }
}

export async function removeOwnedConnection(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string
): Promise<WriteResult> {
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId)
  if (error) return fail("db", "Couldn't remove the connection.")
  return { ok: true }
}
