import type { ConnectionWithBalance } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { type BalanceRow, buildPools } from "./build-pools"

const HISTORY_LIMIT = 30

type HistoryRow = BalanceRow & { connection_id: string }

// Connections + their tool metadata + time-sampled balance history (newest
// first), grouped into one pool per credit_type. History comes from the
// pool_history_sampled RPC (migration 047): the newest reading per 6-hour
// bucket over the last 7 days, plus the newest reading overall - so burn
// rates and sparklines reflect a week of usage, not just the last few hours
// of raw 15-minute readings. `pools` is filtered to the connection's
// watched_credit_types (null = all).
export async function listConnectionsWithBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<ConnectionWithBalance[]> {
  const [connRes, histRes] = await Promise.all([
    supabase
      .from("connections")
      .select(
        `id, user_id, tool_id, connection_type, key_hint, name, tags, status,
         alert_enabled, alert_threshold, low_threshold, alert_fired_at, notified_level,
         last_error,
         consecutive_failures, watched_credit_types, pool_thresholds,
         created_at, updated_at,
         tool:tools(id, name, logo_url, topup_url, default_low_threshold, default_alert_threshold, pools, credential_fields)`
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase.rpc("pool_history_sampled", { p_user_id: userId }),
  ])
  if (connRes.error) throw connRes.error
  if (histRes.error) throw histRes.error

  const byConnection = new Map<string, BalanceRow[]>()
  for (const row of (histRes.data ?? []) as HistoryRow[]) {
    const { connection_id, ...balance } = row
    const group = byConnection.get(connection_id)
    if (group) group.push(balance)
    else byConnection.set(connection_id, [balance])
  }

  // biome-ignore lint/suspicious/noExplicitAny: Supabase embedded-select rows are untyped here
  return (connRes.data ?? []).map((row: any) => ({
    ...row,
    pools: buildPools(
      byConnection.get(row.id) ?? [],
      row.watched_credit_types ?? null,
      HISTORY_LIMIT
    ),
  }))
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
