import { AlertEventList } from "@/components/alerts/AlertEventList"
import { AlertRow } from "@/components/alerts/AlertRow"
import { listConnectionsWithBalance } from "@/lib/db/connections"
import { createClient } from "@/lib/supabase/server"
import type { AlertEvent } from "@/lib/types"
import Link from "next/link"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AlertsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const connections = await listConnectionsWithBalance(supabase, user.id)
  const { data: events } = await supabase
    .from("alert_events")
    .select(
      "id, user_id, connection_id, level, tool_name, connection_name, title, body, pools, dashboard_url, topup_url, read_at, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25)

  return (
    <main className="flex-1 space-y-8 p-8">
      <section>
        <h1 className="mb-2 text-2xl font-bold">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          In-app alerts appear here. Email, Slack, and webhook delivery are
          controlled from{" "}
          <Link
            href="/settings"
            className="font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground"
          >
            Settings
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Alert inbox
        </h2>
        <AlertEventList events={(events ?? []) as AlertEvent[]} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Watched connections
        </h2>
        {connections.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Each one alerts you when a tracked balance crosses your warning
            threshold. Thresholds are set from the dashboard.
          </p>
        )}
        {connections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Connect a tool to configure alerts.
          </p>
        ) : (
          connections.map((c) => <AlertRow key={c.id} connection={c} />)
        )}
      </section>
    </main>
  )
}
