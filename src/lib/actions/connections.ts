"use server"

import { getAdapter } from "@/lib/adapters/registry"
import type { AdapterResult } from "@/lib/adapters/types"
import { type AlertEvaluation, evaluateSeverity } from "@/lib/alerts/severity"
import { buildCredentialSecret } from "@/lib/credentials"
import { decrypt, encrypt, keyHint } from "@/lib/crypto"
import { createClient } from "@/lib/supabase/server"
import { thresholdOrderError } from "@/lib/thresholds"
import type {
  AlertLevel,
  CredentialField,
  NotifyMode,
  PoolDef,
  PoolThresholds,
} from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

export type ActionResult = { ok: true } | { ok: false; error: string }

export type ConnectResult =
  | {
      ok: true
      connectionId: string
      balances: { balance: number; label: string; unit: string }[]
    }
  | { ok: false; error: string }

const NAME_TOO_LONG = "That name is too long (80 characters max)."

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return { supabase, user }
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (!raw) return []
  return String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
}

function buildCredentialFromInput(
  fields: CredentialField[] | null | undefined,
  input: FormData | string
):
  | { ok: true; secret: string; hintValue: string }
  | { ok: false; error: string } {
  if (typeof input !== "string") return buildCredentialSecret(fields, input)

  const secret = input.trim()
  if (!secret) return { ok: false, error: "Credentials are required." }
  return { ok: true, secret, hintValue: secret }
}

export async function connectTool(formData: FormData): Promise<ConnectResult> {
  const { supabase, user } = await requireUser()
  const toolId = String(formData.get("toolId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const tags = parseTags(formData.get("tags"))
  const watched = formData
    .getAll("watchedCreditTypes")
    .map(String)
    .filter(Boolean)

  if (!toolId || !name) return { ok: false, error: "Missing required fields." }
  if (name.length > 80) return { ok: false, error: NAME_TOO_LONG }
  if (tags.length > 20) return { ok: false, error: "Too many tags (20 max)." }
  if (tags.some((t) => t.length > 40))
    return { ok: false, error: "Tags must be 40 characters or fewer." }

  const { data: tool } = await supabase
    .from("tools")
    .select("credential_fields, pools")
    .eq("id", toolId)
    .single()

  // Watched pools must be ones the tool actually declares. A missing tool row
  // declares none; the adapter lookup below still rejects unknown tools.
  if (watched.length > 0) {
    const pools = (tool?.pools as PoolDef[] | null) ?? []
    const known = new Set(pools.map((p) => p.credit_type))
    if (watched.length > 20 || !watched.every((w) => known.has(w)))
      return { ok: false, error: "Unknown credit pool for this tool." }
  }

  const credential = buildCredentialSecret(
    (tool?.credential_fields as CredentialField[] | null) ?? null,
    formData
  )
  if (!credential.ok) return { ok: false, error: credential.error }

  const adapter = getAdapter(toolId)
  if (!adapter) return { ok: false, error: "This tool isn't supported yet." }

  // Validate by performing ONE live balance read (spec §4.4).
  const result = await adapter.readBalance(credential.secret)
  if (!result.ok) return { ok: false, error: result.error }

  const { data: connection, error: insertErr } = await supabase
    .from("connections")
    .insert({
      user_id: user.id,
      tool_id: toolId,
      connection_type: "api",
      encrypted_key: encrypt(credential.secret),
      key_hint: keyHint(credential.hintValue),
      name,
      tags,
      status: "active",
      alert_enabled: true,
      watched_credit_types: watched.length > 0 ? watched : null,
    })
    .select("id")
    .single()
  if (insertErr || !connection)
    return { ok: false, error: "Couldn't save the connection." }

  const { error: balErr } = await supabase.from("balances").insert(
    result.balances.map((b) => ({
      connection_id: connection.id,
      credit_type: b.creditType,
      label: b.label,
      balance: b.balance,
      balance_limit: b.balanceLimit,
      unit: b.unit,
    }))
  )
  if (balErr)
    return { ok: false, error: "Connected, but couldn't record the balance." }

  revalidatePath("/dashboard")
  revalidatePath(`/tools/${toolId}`)
  // Summarize the WATCHED pools (falling back to all readings), so a multi-pool
  // connect reports exactly what's now being tracked, not an unwatched pool.
  const watchedReadings =
    watched.length > 0
      ? result.balances.filter((b) => watched.includes(b.creditType))
      : result.balances
  const summary = watchedReadings.length > 0 ? watchedReadings : result.balances
  return {
    ok: true,
    connectionId: connection.id,
    balances: summary.map((b) => ({
      balance: b.balance,
      label: b.label,
      unit: b.unit,
    })),
  }
}

export async function requestTool(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const toolName = String(formData.get("toolName") ?? "").trim()
  const note = String(formData.get("note") ?? "").trim() || null
  if (!toolName) return { ok: false, error: "Tool name is required." }
  if (toolName.length > 120)
    return { ok: false, error: "Tool name is too long (120 characters max)." }
  if (note && note.length > 1000)
    return { ok: false, error: "Note is too long (1,000 characters max)." }
  const { error } = await supabase
    .from("tool_requests")
    .insert({ user_id: user.id, tool_name: toolName, note })
  if (error) return { ok: false, error: "Couldn't submit your request." }
  return { ok: true }
}

// Reads a connection's live balance and persists it. Shared by manual refresh
// and the polling route. Returns the adapter result for caller-side logic.
export async function refreshConnectionWith(
  supabase: SupabaseClient,
  connectionId: string
): Promise<AdapterResult & { alert?: AlertEvaluation }> {
  const { data: conn } = await supabase
    .from("connections")
    .select(
      `id, user_id, tool_id, encrypted_key, name, alert_enabled, alert_threshold,
       low_threshold, alert_fired_at, notified_level, watched_credit_types,
       pool_thresholds,
       tool:tools(name, topup_url, default_alert_threshold, default_low_threshold)`
    )
    .eq("id", connectionId)
    .single()
  if (!conn || !conn.encrypted_key)
    return { ok: false, error: "Connection not found." }

  const adapter = getAdapter(conn.tool_id)
  if (!adapter) return { ok: false, error: "Unsupported tool." }

  let result: AdapterResult
  try {
    result = await adapter.readBalance(decrypt(conn.encrypted_key))
  } catch {
    result = { ok: false, error: "Couldn't read this connection's balance." }
  }

  if (!result.ok) {
    const { data: cur } = await supabase
      .from("connections")
      .select("consecutive_failures")
      .eq("id", connectionId)
      .single()
    await supabase
      .from("connections")
      .update({
        status: "error",
        last_error: result.error,
        consecutive_failures: (cur?.consecutive_failures ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
    return result
  }

  const { error: insertErr } = await supabase.from("balances").insert(
    result.balances.map((b) => ({
      connection_id: connectionId,
      credit_type: b.creditType,
      label: b.label,
      balance: b.balance,
      balance_limit: b.balanceLimit,
      unit: b.unit,
    }))
  )
  if (insertErr) {
    const { data: cur } = await supabase
      .from("connections")
      .select("consecutive_failures")
      .eq("id", connectionId)
      .single()
    await supabase
      .from("connections")
      .update({
        status: "error",
        last_error: "Couldn't record the balance.",
        consecutive_failures: (cur?.consecutive_failures ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
    return { ok: false, error: "Couldn't record the balance." }
  }

  // Resolve per-pool thresholds and evaluate severity. Email dispatch happens
  // in the poll route, which has the user's email + notify_mode.
  const watched = conn.watched_credit_types as string[] | null
  const poolThresholds = (conn.pool_thresholds as PoolThresholds | null) ?? {}
  // biome-ignore lint/suspicious/noExplicitAny: embedded tool select is untyped
  const tool = (conn as any).tool as {
    name: string
    topup_url: string | null
    default_alert_threshold: number | null
    default_low_threshold: number | null
  } | null

  const evalPools = result.balances
    .filter((b) => !watched || watched.includes(b.creditType))
    .map((b) => {
      const pt = poolThresholds[b.creditType]
      return {
        label: b.label,
        balance: b.balance,
        unit: b.unit ?? null,
        low:
          pt?.low ?? conn.low_threshold ?? tool?.default_low_threshold ?? null,
        critical:
          pt?.critical ??
          conn.alert_threshold ??
          tool?.default_alert_threshold ??
          null,
      }
    })

  const severity = evaluateSeverity(
    evalPools.map((p) => ({
      balance: p.balance,
      low: p.low,
      critical: p.critical,
    }))
  )

  await supabase
    .from("connections")
    .update({
      status: "active",
      last_error: null,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)

  const alert: AlertEvaluation = {
    connectionId,
    userId: conn.user_id,
    toolName: tool?.name ?? "A tool",
    connectionName: conn.name,
    topupUrl: tool?.topup_url ?? null,
    alertEnabled: conn.alert_enabled,
    severity,
    notifiedLevel: (conn.notified_level ?? "none") as AlertLevel,
    pools: evalPools,
  }

  return { ...result, alert }
}

export async function refreshConnection(
  connectionId: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  // refreshConnectionWith is shared with the service-role poll, so the
  // user-scoped ownership check lives here, not inside it (RLS remains the
  // primary guard; this is belt and braces).
  const { data: owned } = await supabase
    .from("connections")
    .select("id")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single()
  if (!owned) return { ok: false, error: "Connection not found." }
  const result = await refreshConnectionWith(supabase, connectionId)
  revalidatePath("/dashboard")
  revalidatePath("/tools/[toolId]", "page")
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function renameConnection(
  connectionId: string,
  name: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: "Name can't be empty." }
  if (trimmed.length > 80) return { ok: false, error: NAME_TOO_LONG }
  const { error } = await supabase
    .from("connections")
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", user.id)
  if (error) return { ok: false, error: "Couldn't rename." }
  revalidatePath("/dashboard")
  revalidatePath("/tools/[toolId]", "page")
  return { ok: true }
}

export async function updateKey(
  connectionId: string,
  credentials: FormData | string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const { data: conn } = await supabase
    .from("connections")
    .select("tool_id, tool:tools(credential_fields)")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single()
  if (!conn) return { ok: false, error: "Connection not found." }
  const adapter = getAdapter(conn.tool_id)
  if (!adapter) return { ok: false, error: "Unsupported tool." }
  // biome-ignore lint/suspicious/noExplicitAny: Supabase embedded-select rows are untyped here
  const tool = (conn as any).tool as {
    credential_fields: CredentialField[] | null
  } | null
  const credential = buildCredentialFromInput(
    tool?.credential_fields,
    credentials
  )
  if (!credential.ok) return { ok: false, error: credential.error }
  const check = await adapter.readBalance(credential.secret)
  if (!check.ok) return { ok: false, error: check.error }
  const { error } = await supabase
    .from("connections")
    .update({
      encrypted_key: encrypt(credential.secret),
      key_hint: keyHint(credential.hintValue),
      status: "active",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("user_id", user.id)
  if (error) return { ok: false, error: "Couldn't update the key." }
  revalidatePath("/dashboard")
  revalidatePath("/tools/[toolId]", "page")
  return { ok: true }
}

export async function removeConnection(
  connectionId: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id)
  if (error) return { ok: false, error: "Couldn't remove the connection." }
  revalidatePath("/dashboard")
  revalidatePath("/tools/[toolId]", "page")
  return { ok: true }
}

export async function setAlert(
  connectionId: string,
  enabled: boolean
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from("connections")
    .update({ alert_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", user.id)
  if (error) return { ok: false, error: "Couldn't update the alert." }
  revalidatePath("/alerts")
  return { ok: true }
}

export async function setNotifyMode(mode: NotifyMode): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from("users")
    .update({ notify_mode: mode })
    .eq("id", user.id)
  if (error) return { ok: false, error: "Couldn't save preference." }
  revalidatePath("/settings")
  return { ok: true }
}

export async function setViewMode(
  mode: "table" | "cards"
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from("users")
    .update({ view_mode: mode })
    .eq("id", user.id)
  if (error) return { ok: false, error: "Couldn't save preference." }
  revalidatePath("/dashboard")
  return { ok: true }
}

// Critical reuses the existing alert_threshold (drives alerts); low_threshold
// is the UI-only early-warning level. Either may be cleared with null.
export async function setThresholds(
  connectionId: string,
  low: number | null,
  critical: number | null
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const orderError = thresholdOrderError(low, critical)
  if (orderError) return { ok: false, error: orderError }
  const { error } = await supabase
    .from("connections")
    .update({
      low_threshold: low,
      alert_threshold: critical,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("user_id", user.id)
  if (error) return { ok: false, error: "Couldn't save thresholds." }
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function setPoolThresholds(
  connectionId: string,
  creditType: string,
  low: number | null,
  critical: number | null
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const orderError = thresholdOrderError(low, critical)
  if (orderError) return { ok: false, error: orderError }
  const { data: conn } = await supabase
    .from("connections")
    .select("pool_thresholds")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single()
  const next = { ...(conn?.pool_thresholds ?? {}) }
  next[creditType] = { low, critical }
  const { error } = await supabase
    .from("connections")
    .update({ pool_thresholds: next, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", user.id)
  if (error) return { ok: false, error: "Couldn't save thresholds." }
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function completeOnboarding(): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
  if (error) return { ok: false, error: "Couldn't save onboarding state." }
  revalidatePath("/dashboard")
  return { ok: true }
}
