import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// QUO-11 put an on-demand outbound-request button in Settings and a health
// summary next to it. Two things about that are load-bearing but invisible to
// a unit test: where the rate-limit counter lives (a column `authenticated`
// can PATCH is not a limit), and that the settings UI actually renders the
// health fields the schema now carries.
function source(relativePath: string): string {
  const path = resolve(process.cwd(), relativePath)
  return existsSync(path) ? readFileSync(path, "utf8") : ""
}

const migration = source(
  "supabase/migrations/057_alert_destination_test_delivery.sql"
)

describe("test-delivery rate limit migration", () => {
  it("dates every attempt, not just the successful ones", () => {
    expect(migration).toContain("alter table public.alert_destinations")
    expect(migration).toContain(
      "add column if not exists last_attempt_at timestamptz"
    )
  })

  it("keeps the counter on users, out of reach of a table-wide UPDATE", () => {
    // 052 column-scoped `authenticated`'s UPDATE on public.users to
    // (notify_mode, view_mode, onboarded_at); alert_destinations still has the
    // blanket grant from 036, so a counter parked there would be resettable.
    expect(migration).toContain("alter table public.users")
    expect(migration).toContain(
      "add column if not exists test_delivery_window_start timestamptz"
    )
    expect(migration).toContain(
      "add column if not exists test_delivery_count integer"
    )
  })

  it("takes no caller-supplied limit", () => {
    // `authenticated` executes this one directly, so a p_limit parameter would
    // be set by the caller trying to evade it.
    expect(migration).toContain(
      "create or replace function public.consume_test_delivery_rate_limit()"
    )
    expect(migration).toContain("security definer")
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain("c_limit constant int")
    expect(migration).toContain("v_user uuid := (select auth.uid())")
  })

  it("grants execution to signed-in users only", () => {
    expect(migration).toContain(
      "revoke execute on function public.consume_test_delivery_rate_limit()"
    )
    expect(migration).toContain("from public, anon")
    expect(migration).toContain(
      "grant execute on function public.consume_test_delivery_rate_limit()"
    )
    expect(migration).toContain("to authenticated, service_role")
  })
})

describe("alert destination settings UI", () => {
  const component = source("src/components/settings/AlertDestinations.tsx")

  it("offers a test send wired through runClientAction", () => {
    expect(component).toContain("sendTestAlertDestination")
    expect(component).toContain("runClientAction")
    expect(component).toContain('aria-label="Send test"')
    expect(component).toContain("Sending test…")
  })

  it("renders last attempt, last success, and the last error", () => {
    expect(component).toContain("Last attempt:")
    expect(component).toContain("last success:")
    expect(component).toContain("Last error:")
    expect(component).toContain("last_attempt_at")
  })

  it("never renders the stored URL or its ciphertext", () => {
    // url_hint is the host-only display value 044 enforces; the full URL lives
    // encrypted and must not reach the client component at all.
    expect(component).toContain("url_hint")
    expect(component).not.toContain("encrypted_url")
  })

  it("selects the health fields it renders", () => {
    const page = source("src/app/(dashboard)/settings/page.tsx")
    expect(page).toContain("last_attempt_at")
    expect(page).not.toContain("encrypted_url")
  })
})
