"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

// Map raw Supabase auth errors to clear, actionable copy. Unknown messages
// pass through unchanged so we never hide a real failure reason.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes("invalid login credentials"))
    return "That email and password don't match. Try again, or reset your password."
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Try signing in instead."
  if (m.includes("email not confirmed"))
    return "Please confirm your email first - check your inbox for the link."
  return message
}

export async function login(
  formData: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  })
  if (error) return { error: friendlyAuthError(error.message) }
  redirect("/dashboard")
}

export async function signup(
  formData: FormData
): Promise<{ error: string } | undefined> {
  const password = String(formData.get("password"))
  // Server-side mirror of the form's minLength (a direct POST bypasses it).
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  })
  if (error) return { error: friendlyAuthError(error.message) }
  // User gets session immediately (Confirm email disabled in Supabase dashboard)
  redirect("/dashboard")
}

export async function resetPassword(
  formData: FormData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(String(formData.get("email")), {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?type=recovery&next=/update-password`,
  })
  // Always redirect; never leak whether the email exists
  redirect("/login?message=check_email")
}

export async function updatePassword(
  formData: FormData
): Promise<{ error: string } | undefined> {
  const password = String(formData.get("password"))
  // Server-side length check (the form's minLength is bypassable via a direct
  // POST to the action).
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." }
  }

  const supabase = await createClient()
  // Requires an authenticated session - normally the recovery session that
  // /auth/confirm (exchangeCodeForSession) established. Guard for a clean
  // message if the reset link expired or was already used.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Your reset link has expired. Request a new one." }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect("/dashboard")
}

export async function logout(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
