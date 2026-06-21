"use server"

import { generateApiToken } from "@/lib/auth/api-token"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type ActionResult =
  | { ok: true; secret?: string }
  | { ok: false; error: string }

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return { supabase, user }
}

export async function createApiToken(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const name = String(formData.get("name") ?? "").trim()

  if (!name) return { ok: false, error: "Give the token a name." }
  if (name.length > 80)
    return { ok: false, error: "Name must be 80 characters or fewer." }

  const { raw, hash, hint } = generateApiToken()

  const { error } = await supabase.from("api_tokens").insert({
    user_id: user.id,
    name,
    token_hash: hash,
    token_hint: hint,
  })

  if (error) return { ok: false, error: "Couldn't create the token." }
  revalidatePath("/settings")
  // raw is returned once and never stored; the caller must display it immediately
  return { ok: true, secret: raw }
}

export async function revokeApiToken(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  const id = String(formData.get("id") ?? "").trim()

  if (!id) return { ok: false, error: "Missing token ID." }

  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null) // idempotent: don't double-revoke

  if (error) return { ok: false, error: "Couldn't revoke the token." }
  revalidatePath("/settings")
  return { ok: true }
}
