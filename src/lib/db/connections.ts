import type { ConnectionWithBalance } from "@/lib/types"
import type { SupabaseClient } from "@supabase/supabase-js"
import { type BalanceRow, buildPools } from "./build-pools"

const HISTORY_LIMIT = 30
const HISTORY_PAGE_SIZE = 1000

type HistoryRow = BalanceRow & { connection_id: string }

// pool_history_sampled bounds rows per POOL (~29), not per response, so a user
// wide enough to cross PostgREST's `max_rows` in total lost the trailing
// connections' history entirely and those pools rendered as "No data".
// Offset paging is right here (the RPC has a total ORDER BY, and there is no
// cursor column to key on); the offset advances by the rows actually returned
// and the loop stops only on an empty page, so a max_rows below the page size
// cannot end it early.
async function fetchPoolHistory(
  supabase: SupabaseClient,
  userId: string
): Promise<HistoryRow[]> {
  const rows: HistoryRow[] = []
  for (;;) {
    const { data, error } = await supabase
      .rpc("pool_history_sampled", { p_user_id: userId })
      .range(rows.length, rows.length + HISTORY_PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as HistoryRow[]
    if (page.length === 0) return rows
    rows.push(...page)
  }
}

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
  const [connRes, history] = await Promise.all([
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
    fetchPoolHistory(supabase, userId),
  ])
  if (connRes.error) throw connRes.error

  const byConnection = new Map<string, BalanceRow[]>()
  for (const row of history) {
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
