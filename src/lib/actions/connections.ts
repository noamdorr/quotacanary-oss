"use server"

import {
  type ConnectionCredential,
  UUID_PATTERN,
  type WriteResult,
  findConnectionWithSameKey,
  insertConnection,
  prepareConnection,
  rekeyOwnedConnection,
  removeOwnedConnection,
  renameOwnedConnection,
} from "@/lib/connection-writes"
import { refreshConnectionWith } from "@/lib/refresh-connection"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import {
  criticalFor,
  thresholdOrderError,
  warnBelowError,
} from "@/lib/thresholds"
import type { NotifyMode } from "@/lib/types"
import { revalidatePath } from "next/cache"

export type ActionResult = { ok: true } | { ok: false; error: string }

export type ConnectResult =
  | {
      ok: true
      connectionId: string
      balances: { balance: number; label: string; unit: string }[]
    }
  | { ok: false; error: string; existingConnectionId?: string }

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

// The shared write functions carry an error code for the API; the web only
// shows the message.
function toActionResult(result: WriteResult): ActionResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

export async function connectTool(formData: FormData): Promise<ConnectResult> {
  const { supabase, user } = await requireUser()
  const createRequestId = String(formData.get("createRequestId") ?? "")

  if (!UUID_PATTERN.test(createRequestId)) {
    return {
      ok: false,
      error: "Couldn't start the connection. Please try again.",
    }
  }

  const toolId = String(formData.get("toolId") ?? "")
  // One key, one connection: a second copy would poll and email twice. Checked
  // before the vendor read, so a duplicate costs no vendor call (QUO-293).
  const sameKey = await findConnectionWithSameKey(
    createAdminClient(),
    user.id,
    toolId,
    formData,
    createRequestId
  )
  if (sameKey)
    return {
      ok: false,
      // Copy staged for Noam's pick (QUO-293).
      error: `That key is already connected as ${sameKey.name}.`,
      existingConnectionId: sameKey.connectionId,
    }

  const prepared = await prepareConnection(supabase, {
    toolId,
    name: String(formData.get("name") ?? ""),
    tags: parseTags(formData.get("tags")),
    watchedCreditTypes: formData.getAll("watchedCreditTypes").map(String),
    credential: formData,
  })
  if (!prepared.ok) return { ok: false, error: prepared.error }

  const inserted = await insertConnection(
    supabase,
    prepared.prepared,
    createRequestId
  )
  if (!inserted.ok) return { ok: false, error: inserted.error }

  revalidatePath("/dashboard")
  revalidatePath(`/tools/${toolId}`)
  return {
    ok: true,
    connectionId: inserted.connectionId,
    balances: prepared.prepared.summary,
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
  const result = await renameOwnedConnection(
    supabase,
    user.id,
    connectionId,
    name
  )
  if (!result.ok) return toActionResult(result)
  revalidatePath("/dashboard")
  revalidatePath("/tools/[toolId]", "page")
  return { ok: true }
}

export async function updateKey(
  connectionId: string,
  credentials: ConnectionCredential
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  // The owner-scoped lookup runs on the session client (RLS remains the
  // primary guard); only the ciphertext write escalates to the admin client.
  const result = await rekeyOwnedConnection(
    supabase,
    createAdminClient(),
    user.id,
    connectionId,
    credentials
  )
  if (!result.ok) return toActionResult(result)
  revalidatePath("/dashboard")
  revalidatePath("/tools/[toolId]", "page")
  return { ok: true }
}

export async function removeConnection(
  connectionId: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const result = await removeOwnedConnection(supabase, user.id, connectionId)
  if (!result.ok) return toActionResult(result)
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

// One user-set number per balance: Warn below is stored as low and Critical is
// derived from it on save. null (a blank field) removes the balance's override
// so it falls back to the connection and tool defaults. Other balances' stored
// pairs are left as they are, 3:1 or not.
export async function setPoolThresholds(
  connectionId: string,
  creditType: string,
  warnBelow: number | null
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const invalid = warnBelowError(warnBelow)
  if (invalid) return { ok: false, error: invalid }
  const { data: conn, error: readError } = await supabase
    .from("connections")
    .select("pool_thresholds")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .single()
  // Writing back from an empty map would drop every other balance's number.
  if (readError || !conn)
    return { ok: false, error: "Couldn't save thresholds." }
  const next = { ...(conn.pool_thresholds ?? {}) }
  if (warnBelow == null) delete next[creditType]
  else next[creditType] = { low: warnBelow, critical: criticalFor(warnBelow) }
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
