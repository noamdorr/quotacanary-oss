import type { ConnectionWithBalance } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { type BalanceRow, buildPools } from "./build-pools"

const HISTORY_LIMIT = 30

// Connections + their tool metadata + recent balance readings (newest first),
// grouped into one pool per credit_type. `pools` is filtered to the
// connection's watched_credit_types (null = all).
export async function listConnectionsWithBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<ConnectionWithBalance[]> {
  const { data, error } = await supabase
    .from("connections")
    .select(
      `id, user_id, tool_id, connection_type, key_hint, name, tags, status,
       alert_enabled, alert_threshold, low_threshold, alert_fired_at, notified_level,
       last_error,
       consecutive_failures, watched_credit_types, pool_thresholds,
       created_at, updated_at,
       tool:tools(id, name, logo_url, topup_url, default_low_threshold, default_alert_threshold, pools, credential_fields),
       balances(credit_type, label, unit, balance, balance_limit, recorded_at)`
    )
    .eq("user_id", userId)
    .order("recorded_at", { foreignTable: "balances", ascending: false })
    .order("created_at", { ascending: true })
  if (error) throw error

  // biome-ignore lint/suspicious/noExplicitAny: Supabase embedded-select rows are untyped here
  return (data ?? []).map((row: any) => {
    const { balances, ...rest } = row
    return {
      ...rest,
      pools: buildPools(
        (balances ?? []) as BalanceRow[],
        rest.watched_credit_types ?? null,
        HISTORY_LIMIT
      ),
    }
  })
}

export async function listConnectionsForTool(
  supabase: SupabaseClient,
  userId: string,
  toolId: string
): Promise<ConnectionWithBalance[]> {
  return (await listConnectionsWithBalance(supabase, userId)).filter(
    (c) => c.tool_id === toolId
  )
}
