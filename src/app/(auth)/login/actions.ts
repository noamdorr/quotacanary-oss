"use server"

import { createClient } from "@/lib/supabase/server"
import { magicLinkRedirectUrl } from "@/lib/tool-intent"
import { redirect } from "next/navigation"

// Map raw Supabase auth errors to clear, actionable copy. Unknown messages
// pass through unchanged so we never hide a real failure reason.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes("security purposes") || m.includes("rate limit"))
    return "Too many requests. Wait a minute, then try again."
  if (m.includes("signups not allowed"))
    return "Sign-ups are closed for that email right now."
  return message
}

export async function sendMagicLink(
  formData: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: String(formData.get("email")),
    options: {
      // Falls back to the bare /auth/confirm URL whenever there is no usable
      // tool intent, so an absent or malformed `tool` never breaks sign-in.
      emailRedirectTo: magicLinkRedirectUrl(
        process.env.NEXT_PUBLIC_SITE_URL,
        formData.get("tool")
      ),
    },
  })
  if (error) return { error: friendlyAuthError(error.message) }
}

export async function logout(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
