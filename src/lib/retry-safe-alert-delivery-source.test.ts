import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/048_retry_safe_alert_delivery.sql"
)
const source = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : ""

describe("retry-safe alert delivery migration", () => {
  it("adds delivery lifecycle fields to alert_events", () => {
    expect(source).toContain(
      "add column if not exists delivery_satisfied_at timestamptz"
    )
    expect(source).toContain(
      "add column if not exists delivery_canceled_at timestamptz"
    )
    // Pre-existing events were delivered under the old advance-on-create model;
    // they must be marked satisfied before the active-event index can build.
    expect(source).toContain("set delivery_satisfied_at = created_at")
  })

  it("allows only one active event per connection and level", () => {
    expect(source).toContain(
      "create unique index if not exists idx_alert_events_active_per_connection_level"
    )
    expect(source).toContain(
      "where delivery_satisfied_at is null and delivery_canceled_at is null"
    )
  })

  it("creates alert_deliveries with one row per event and delivery target", () => {
    expect(source).toContain(
      "create table if not exists public.alert_deliveries"
    )
    expect(source).toContain(
      "references public.alert_events(id) on delete cascade"
    )
    expect(source).toContain(
      "references public.alert_destinations(id) on delete set null"
    )
    expect(source).toContain("unique (event_id, delivery_key)")
    expect(source).toContain(
      "check (channel in ('email', 'webhook', 'slack_webhook'))"
    )
    expect(source).toContain(
      "check (status in ('pending', 'succeeded', 'paused', 'canceled'))"
    )
    expect(source).toContain("target_updated_at timestamptz not null")
    expect(source).toContain("claim_token")
    expect(source).toContain("claimed_until")
  })

  it("enables RLS without user policies and locks table access to service role paths", () => {
    expect(source).toContain(
      "alter table public.alert_deliveries enable row level security"
    )
    expect(source).not.toMatch(/create policy .*alert_deliveries/i)
  })

  it("claims due deliveries atomically with a five-minute lease", () => {
    expect(source).toContain(
      "create or replace function public.claim_due_alert_deliveries"
    )
    expect(source).toContain("for update of d skip locked")
    expect(source).toContain("interval '5 minutes'")
    expect(source).toContain("claim_token = gen_random_uuid()")
    // Paused rows become eligible when their target's source row is newer.
    expect(source).toContain("> d.target_updated_at")
  })

  it("records results atomically behind the claim token", () => {
    expect(source).toContain(
      "create or replace function public.record_alert_delivery_result"
    )
    expect(source).toContain("p_claim_token")
    expect(source).toContain("delivery_satisfied_at")
    expect(source).toContain("notified_level")
    expect(source).toContain("alert_fired_at")
  })

  it("pins search_path and restricts both functions to the service role", () => {
    const searchPathPins = source.match(/set search_path = ''/g) ?? []
    expect(searchPathPins.length).toBeGreaterThanOrEqual(2)
    expect(source).toMatch(
      /revoke (all|execute) on function public\.claim_due_alert_deliveries[\s\S]*?from public, anon, authenticated/
    )
    expect(source).toMatch(
      /revoke (all|execute) on function public\.record_alert_delivery_result[\s\S]*?from public, anon, authenticated/
    )
    expect(source).toMatch(
      /grant execute on function public\.claim_due_alert_deliveries[\s\S]*?to service_role/
    )
    expect(source).toMatch(
      /grant execute on function public\.record_alert_delivery_result[\s\S]*?to service_role/
    )
  })
})
