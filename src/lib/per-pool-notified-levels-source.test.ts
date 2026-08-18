import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/056_per_pool_notified_levels.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

describe("per-pool notified levels migration", () => {
  it("adds the per-pool mark map and the event's covered credit types", () => {
    expect(source).toContain(
      "add column if not exists notified_levels jsonb not null default '{}'::jsonb"
    )
    expect(source).toContain("add column if not exists credit_types text[]")
  })

  it("backfills existing marks so a deploy does not re-alert live connections", () => {
    // Keys come from the watch list unioned with every credit_type the
    // connection has reported, because a null watch list means "watch all".
    expect(source).toContain("unnest(c.watched_credit_types)")
    expect(source).toContain("from public.balances b")
    expect(source).toContain("where c.notified_level <> 'none'")
    // Only seeds connections that have not been migrated already.
    expect(source).toContain("c.notified_levels = '{}'::jsonb")
  })

  it("advances only the pools the delivered event named, and only upward", () => {
    expect(source).toContain(
      "create or replace function public.record_alert_delivery_result"
    )
    expect(source).toContain(
      "foreach v_credit_type in array coalesce(v_event.credit_types, '{}'::text[])"
    )
    expect(source).toContain("jsonb_set(")
    // The connection-level column stays the rollup of the map: the dashboard's
    // "Alerted" badge reads it.
    expect(source).toContain("notified_level = (")
    expect(source).toContain("jsonb_each_text(v_levels)")
  })

  it("keeps the function pinned and service-role only", () => {
    expect(source).toContain("set search_path = ''")
    expect(source).toMatch(
      /revoke all on function public\.record_alert_delivery_result[\s\S]*?from public, anon, authenticated/
    )
    expect(source).toMatch(
      /grant execute on function public\.record_alert_delivery_result[\s\S]*?to service_role/
    )
  })
})
