import { Canary } from "@/components/brand/Canary"
import { DashboardClient } from "@/components/dashboard/DashboardClient"
import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow"
import { Button } from "@/components/ui/button"
import { listConnectionsWithBalance } from "@/lib/db/connections"
import { type FeaturedTool, resolveFeaturedTools } from "@/lib/featured-tools"
import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

type DashboardPageProps = {
  searchParams: Promise<{ connected?: string }>
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const supabase = await createClient()
  const params = await searchParams
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("view_mode, onboarded_at")
    .eq("id", user.id)
    .single()

  const connections = await listConnectionsWithBalance(supabase, user.id)
  const recentConnectionId =
    params.connected && connections.some((c) => c.id === params.connected)
      ? params.connected
      : null

  // First-run onboarding: shown until the user finishes or skips. A user with
  // at least one connection is implicitly onboarded, so we never bounce someone
  // who left onboarding via "See all tools", connected a tool, then came back.
  if (!profile?.onboarded_at && connections.length === 0) {
    const { data: tools, count } = await supabase
      .from("tools")
      .select(
        "id, name, logo_url, key_instructions, default_low_threshold, default_alert_threshold, pools, credential_fields",
        { count: "exact" }
      )
      .eq("is_active", true)
      .order("name")
    const featured = resolveFeaturedTools((tools ?? []) as FeaturedTool[])
    return (
      <main className="flex-1 p-8">
        <OnboardingFlow featured={featured} totalToolCount={count ?? 0} />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[1520px] flex-1 p-8">
      <h1 className="mb-6 text-2xl font-bold">Dashboard</h1>
      {connections.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border/60 py-20 text-center">
          <Canary mood="sleepy" size={64} />
          <p className="text-xl font-semibold">No tools connected yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Connect a credit-based tool to start monitoring balances and getting
            alerts.
          </p>
          <Button nativeButton={false} render={<Link href="/connect" />}>
            Connect a tool
          </Button>
        </div>
      ) : (
        <DashboardClient
          connections={connections}
          defaultView={profile?.view_mode === "cards" ? "cards" : "table"}
          recentConnectionId={recentConnectionId}
        />
      )}
    </main>
  )
}
