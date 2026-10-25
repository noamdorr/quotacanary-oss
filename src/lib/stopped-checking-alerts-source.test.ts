import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/089_stopped_checking_alerts.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

// QUO-289. The live behaviour is proven by
// supabase/tests/089_stopped_checking_alerts.sql; this pins the shape.
describe("stopped-checking alerts migration", () => {
  it("adds the incident stamp and the event kind", () => {
    expect(source).toContain(
      "add column if not exists failure_alerted_at timestamptz"
    )
    expect(source).toMatch(
      /add column if not exists kind text not null default 'balance'\s+check \(kind in \('balance', 'stopped_checking'\)\)/
    )
  })

  it("scopes the one-active-event index by kind", () => {
    expect(source).toContain(
      "drop index if exists public.idx_alert_events_active_per_connection_level"
    )
    expect(source).toContain(
      "on public.alert_events (connection_id, kind, level)"
    )
    expect(source).toContain(
      "where delivery_satisfied_at is null and delivery_canceled_at is null"
    )
  })

  it("stamps the incident on delivery and leaves the balance marks alone", () => {
    expect(source).toContain(
      "create or replace function public.record_alert_delivery_result"
    )
    expect(source).toContain("if v_event.kind = 'stopped_checking' then")
    expect(source).toContain("set failure_alerted_at = v_event.created_at")
  })

  it("keeps the stamp out of the user's column grant", () => {
    // 065 scopes authenticated UPDATE to a column list; the stamp is a
    // server-owned alert mark like notified_level.
    expect(source).not.toMatch(/grant update[\s\S]*failure_alerted_at/)
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
