import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Service-role client. Bypasses RLS; use ONLY in trusted server contexts
// (the /api/poll route). Never import into client components or browser code.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
