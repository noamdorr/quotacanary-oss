"use server"

import {
  type AlertDeliveryLevel,
  type AlertDestinationKind,
  destinationUrlHint,
  validateDestinationUrl,
} from "@/lib/alerts/destinations"
import { encrypt } from "@/lib/crypto"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type ActionResult = { ok: true } | { ok: false; error: string }

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return { supabase, user }
}

export async function createAlertDestination(
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const kind = parseKind(String(formData.get("kind") ?? ""))
  const minLevel = parseMinLevel(String(formData.get("minLevel") ?? "low"))
  const url = validateDestinationUrl(String(formData.get("url") ?? ""))
  const name = String(formData.get("name") ?? "").trim()

  if (!kind) return { ok: false, error: "Choose a destination type." }
  if (!minLevel) return { ok: false, error: "Choose an alert level." }
  if (!url.ok) return url

  const fallbackName = kind === "slack_webhook" ? "Slack" : "Webhook"
  const { error } = await supabase.from("alert_destinations").insert({
    user_id: user.id,
    kind,
    name: name || fallbackName,
    encrypted_url: encrypt(url.url),
    url_hint: destinationUrlHint(url.url),
    min_level: minLevel,
  })

  if (error) return { ok: false, error: "Couldn't save the destination." }
  revalidatePath("/settings")
  return { ok: true }
}

export async function toggleAlertDestination(
  formData: FormData
): Promise<void> {
  const { supabase } = await requireUser()
  const id = String(formData.get("id") ?? "")
  const enabled = String(formData.get("enabled") ?? "") === "true"
  if (!id) return

  const { error } = await supabase
    .from("alert_destinations")
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (error) return
  revalidatePath("/settings")
}

export async function deleteAlertDestination(
  formData: FormData
): Promise<void> {
  const { supabase } = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!id) return

  const { error } = await supabase
    .from("alert_destinations")
    .delete()
    .eq("id", id)

  if (error) return
  revalidatePath("/settings")
}

export async function markAlertEventRead(formData: FormData): Promise<void> {
  const { supabase } = await requireUser()
  const id = String(formData.get("id") ?? "")
  if (!id) return

  const { error } = await supabase
    .from("alert_events")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)

  if (error) return
  revalidatePath("/alerts")
}

function parseKind(value: string): AlertDestinationKind | null {
  if (value === "webhook" || value === "slack_webhook") return value
  return null
}

function parseMinLevel(value: string): AlertDeliveryLevel | null {
  if (value === "low" || value === "critical") return value
  return null
}
