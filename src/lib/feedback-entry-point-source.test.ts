import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// QUO-18 put a feedback entry point in the app shell and a new capture table
// behind it. Three things about that are load-bearing but invisible to a unit
// test: that the trigger is actually mounted in the shared layout (a dialog
// nobody can open is not an entry point), that the table is append-only and
// not reachable by anon, and that the rate limit sits where a user cannot
// reset it.
function source(relativePath: string): string {
  const path = resolve(process.cwd(), relativePath)
  return existsSync(path) ? readFileSync(path, "utf8") : ""
}

const migration = source("supabase/migrations/059_feedback_submissions.sql")
const layout = source("src/app/(dashboard)/layout.tsx")
const dialog = source("src/components/dashboard/FeedbackDialog.tsx")
const action = source("src/lib/actions/feedback.ts")

describe("feedback entry point", () => {
  it("mounts the trigger in the dashboard shell, not on one page", () => {
    expect(layout).toContain(
      'import { FeedbackTrigger } from "@/components/dashboard/FeedbackDialog"'
    )
    expect(layout).toContain("<FeedbackTrigger />")
  })

  it("keeps a visible label at md+ and an accessible name below it", () => {
    // The trigger collapses to an icon on mobile; without the sr-only span it
    // would be a button with no accessible name.
    expect(dialog).toContain('className="sr-only md:not-sr-only"')
  })

  it("offers all three categories the issue asked for", () => {
    expect(dialog).toContain('value: "bug"')
    expect(dialog).toContain('value: "feedback"')
    expect(dialog).toContain('value: "tool"')
  })

  it("confirms the submission and names the response path", () => {
    expect(dialog).toContain("Thanks - that's in")
    expect(dialog).toContain("your account email")
  })
})

describe("feedback capture migration", () => {
  it("stores diagnostic context and no secrets", () => {
    expect(migration).toContain(
      "create table if not exists public.feedback_submissions"
    )
    expect(migration).toContain("page_path   text")
    expect(migration).toContain("app_version text")
    expect(migration).toContain("user_agent  text")
  })

  it("only accepts the categories that have nowhere else to land", () => {
    // 'tool' is absent on purpose: those rows go to tool_requests (002).
    expect(migration).toContain("check (category in ('bug', 'feedback'))")
  })

  it("is append-only and closed to anon", () => {
    // 036/039 set ALTER DEFAULT PRIVILEGES, so a new table is born with full
    // DML for anon and authenticated unless it is revoked.
    expect(migration).toContain(
      "revoke all on public.feedback_submissions from anon, authenticated"
    )
    expect(migration).toContain(
      "grant select, insert on public.feedback_submissions to authenticated"
    )
  })

  it("gates rows behind RLS on the owner", () => {
    expect(migration).toContain(
      "alter table public.feedback_submissions enable row level security"
    )
    expect(migration).toContain("with check ((select auth.uid()) = user_id)")
    expect(migration).toContain("using ((select auth.uid()) = user_id)")
  })

  it("keeps the rate-limit counter out of reach of a user UPDATE", () => {
    // 052 column-scoped `authenticated`'s UPDATE on public.users to
    // (notify_mode, view_mode, onboarded_at); both columns below sit outside
    // that list, so only the SECURITY DEFINER function can move them.
    expect(migration).toContain("alter table public.users")
    expect(migration).toContain(
      "add column if not exists feedback_window_start timestamptz"
    )
    expect(migration).toContain(
      "add column if not exists feedback_count integer"
    )
  })

  it("takes no caller-supplied limit or subject", () => {
    expect(migration).toContain(
      "create or replace function public.consume_feedback_rate_limit()"
    )
    expect(migration).toContain("security definer")
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain("c_limit constant int")
    expect(migration).toContain("v_user uuid := (select auth.uid())")
  })

  it("grants execution to signed-in users only", () => {
    expect(migration).toContain(
      "revoke execute on function public.consume_feedback_rate_limit()"
    )
    expect(migration).toContain("from public, anon")
    expect(migration).toContain("to authenticated, service_role")
  })
})

describe("feedback routing", () => {
  it("never mails feedback anywhere unless the operator opted in", () => {
    // A self-hosted instance must not post its users' feedback to the hosted
    // inbox, so there is no default recipient.
    expect(action).toContain("process.env.FEEDBACK_NOTIFY_EMAIL")
    expect(action).not.toContain("hey@quotacanary.com")
  })

  it("stamps the app version server-side", () => {
    expect(action).toContain("app_version: APP_VERSION")
  })

  it('exports only async functions from the "use server" file', () => {
    // Next refuses to evaluate a "use server" module that exports a runtime
    // value ("can only export async functions, found object"). `npm run build`
    // does NOT catch it - it only blew up on the first real submit, so this
    // guard stands in for that.
    expect(action).toContain('"use server"')
    const runtimeExports = action
      .split("\n")
      .filter((line) => /^export (?!type |async function )/.test(line))
    expect(runtimeExports).toEqual([])
  })
})
