import { createAdminClient } from "@/lib/supabase/admin"
import type { Tool } from "@/lib/types"

// Reads the public tool catalog for the marketing directory. The catalog is
// non-sensitive, so we use the service-role client at build time and avoid an
// anon RLS change. Server-only: never import this from a client component.
const TOOL_COLUMNS =
  "id, name, logo_url, api_docs_url, key_instructions, category, description, website_url, integration_type, default_alert_threshold, default_low_threshold, topup_url, is_active, pools, credential_fields"

export async function getActiveTools(): Promise<Tool[]> {
  // Single-domain / self-host / CI builds run with APP_ONLY=true and may have no
  // reachable Supabase. The marketing directory is not served in that mode, so
  // skip the build-time catalog query and return an empty list (keeps `next build`
  // green without a live database) instead of throwing.
  if (process.env.APP_ONLY === "true") return []
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("tools")
    .select(TOOL_COLUMNS)
    .eq("is_active", true)
    .order("name")
  if (error) throw new Error(`getActiveTools failed: ${error.message}`)
  return (data ?? []) as Tool[]
}

export async function getToolById(id: string): Promise<Tool | null> {
  if (process.env.APP_ONLY === "true") return null
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("tools")
    .select(TOOL_COLUMNS)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle()
  if (error) throw new Error(`getToolById failed: ${error.message}`)
  return (data as Tool | null) ?? null
}
