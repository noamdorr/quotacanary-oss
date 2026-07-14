import "server-only"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// Service-role client. Bypasses RLS; use ONLY in trusted server contexts
// (poll, alert dispatch, API/MCP token auth). The server-only import makes
// any client-bundle import a build error instead of a leaked key.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
