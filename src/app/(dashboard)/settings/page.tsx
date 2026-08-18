import { logout } from "@/app/(auth)/login/actions"
import { MARKETING_URL } from "@/components/marketing/constants"
import { AlertDestinations } from "@/components/settings/AlertDestinations"
import { ApiTokens } from "@/components/settings/ApiTokens"
import { NotificationPrefs } from "@/components/settings/NotificationPrefs"
import { Button } from "@/components/ui/button"
import { QueryError } from "@/components/ui/query-error"
import { createClient } from "@/lib/supabase/server"
import type { AlertDestination, NotifyMode } from "@/lib/types"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Each query backs one section, so each failure is scoped to that section:
  // a dead token query should not cost you the notification toggle.
  // `maybeSingle` keeps an absent profile row a null (the default applies)
  // rather than an error, so only a real failure reaches QueryError.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("notify_mode")
    .eq("id", user.id)
    .maybeSingle()
  const { data: destinations, error: destinationsError } = await supabase
    .from("alert_destinations")
    .select(
      "id, user_id, kind, name, url_hint, min_level, is_enabled, signing_secret_set_at, last_attempt_at, last_sent_at, last_error, consecutive_failures, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  const { data: tokens, error: tokensError } = await supabase
    .from("api_tokens")
    .select("id, name, token_hint, last_used_at, revoked_at, created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })

  return (
    <main className="flex-1 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        <section className="card space-y-4 p-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Email notifications
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose whether low, critical, or no email alerts get through.
            </p>
          </div>
          {profileError ? (
            <QueryError what="your email notification setting" />
          ) : (
            <NotificationPrefs
              current={
                (profile?.notify_mode ?? "low_and_critical") as NotifyMode
              }
            />
          )}
        </section>

        <section id="integrations" className="card space-y-5 p-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              Integrations
            </h2>
            <p className="text-sm text-muted-foreground">
              Two ways to wire QuotaCanary into your stack - webhooks push
              alerts out, tokens let the API and MCP pull balances in.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Webhooks</h3>
            <p className="text-sm text-muted-foreground">
              Send alerts to Slack incoming webhooks or any public HTTPS
              endpoint.
            </p>
            {destinationsError ? (
              <QueryError what="your webhook destinations" />
            ) : (
              <AlertDestinations
                destinations={(destinations ?? []) as AlertDestination[]}
              />
            )}
          </div>

          <div className="space-y-2 border-t border-border/60 pt-5">
            <h3 className="text-sm font-medium text-foreground">
              API &amp; MCP tokens
            </h3>
            <p className="text-sm text-muted-foreground">
              Read-only personal access tokens for the QuotaCanary API and MCP
              server.{" "}
              <a
                href={`${MARKETING_URL}/docs`}
                className="font-medium underline underline-offset-4 hover:text-foreground"
              >
                Read the API &amp; MCP docs →
              </a>
            </p>
            {tokensError ? (
              <QueryError what="your API tokens" />
            ) : (
              <ApiTokens tokens={tokens ?? []} />
            )}
          </div>
        </section>

        <section className="card space-y-3 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-foreground">Account</h2>
          <p className="text-sm text-muted-foreground">Email: {user.email}</p>
          <form action={logout}>
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </section>
      </div>
    </main>
  )
}
