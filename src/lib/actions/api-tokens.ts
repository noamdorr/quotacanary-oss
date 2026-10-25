"use server"

import {
  MAX_ACTIVE_TOKENS_PER_USER,
  generateApiToken,
  scopesForChoice,
} from "@/lib/auth/api-token"
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
  // Still gates on a real session; the RPC derives the owner from auth.uid()
  // itself, so the action no longer passes a user ID of its own.
  const { supabase } = await requireUser()
  const name = String(formData.get("name") ?? "").trim()

  if (!name) return { ok: false, error: "Give the token a name." }
  if (name.length > 80)
    return { ok: false, error: "Name must be 80 characters or fewer." }
  // Read-only unless the form opted into write (the Mac app's connected mode).
  const scopes = scopesForChoice(String(formData.get("scope") ?? "read"))
  if (!scopes) return { ok: false, error: "Pick a token scope." }

  const { raw, hash, hint } = generateApiToken()

  // The cap check and the insert live inside one locked Postgres function
  // (migration 051, scopes added in 070) so a concurrent burst can't slip past
  // the limit (QUO-67).
  const { data: tokenId, error } = await supabase.rpc("create_api_token", {
    p_name: name,
    p_token_hash: hash,
    p_token_hint: hint,
    p_max_active: MAX_ACTIVE_TOKENS_PER_USER,
    p_scopes: scopes,
  })

  if (error) return { ok: false, error: "Couldn't create the token." }
  // The RPC returns the new token's ID, or null when the user is already at
  // the cap. Anything else is unexpected, so refuse rather than claim success.
  if (typeof tokenId !== "string") {
    return {
      ok: false,
      error: `You've hit the ${MAX_ACTIVE_TOKENS_PER_USER}-token limit. Revoke one before creating another.`,
    }
  }
  revalidatePath("/settings")
  // raw is returned once and never stored; the caller must display it immediately
  return { ok: true, secret: raw }
}

export async function revokeApiToken(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  // Still gates on a real session; the RPC derives the owner from auth.uid()
  // itself, so the action no longer passes a user ID of its own.
  const { supabase } = await requireUser()
  const id = String(formData.get("id") ?? "").trim()

  if (!id) return { ok: false, error: "Missing token ID." }

  // `authenticated` no longer holds UPDATE on api_tokens (migration 052), so
  // revocation runs through a SECURITY DEFINER RPC that re-checks ownership
  // and stays idempotent on an already-revoked token.
  const { error } = await supabase.rpc("revoke_api_token", {
    p_token_id: id,
  })

  if (error) return { ok: false, error: "Couldn't revoke the token." }
  revalidatePath("/settings")
  return { ok: true }
}
