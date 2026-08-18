import { ToolGrid } from "@/components/connect/ToolGrid"
import { QueryError } from "@/components/ui/query-error"
import { createClient } from "@/lib/supabase/server"
import { sanitizeToolId } from "@/lib/tool-intent"
import type { Tool } from "@/lib/types"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

interface ConnectPageProps {
  searchParams: Promise<{ tool?: string }>
}

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [
    { data: tools, error: toolsError },
    { data: connections, error: connectionsError },
  ] = await Promise.all([
    supabase.from("tools").select("*").eq("is_active", true).order("name"),
    supabase.from("connections").select("tool_id").eq("user_id", user.id),
  ])

  const connectedToolIds = [
    ...new Set((connections ?? []).map((c) => c.tool_id)),
  ]

  // The existence half of validating a `tool` intent: an id that is not in the
  // active catalog this page already loaded preselects nothing, leaving the
  // plain grid rather than erroring. This is the only place with an
  // authenticated catalog to check against - see lib/tool-intent.ts.
  const requestedToolId = sanitizeToolId((await searchParams).tool)
  const preselectToolId =
    requestedToolId && (tools ?? []).some((t) => t.id === requestedToolId)
      ? requestedToolId
      : null

  // Either failure makes the grid lie: no catalog reads as "no tools exist",
  // and no connections marks every tool unconnected, inviting a duplicate key.
  const loadFailed = toolsError !== null || connectionsError !== null

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1520px] flex-1 p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-bold">Connect a tool</h1>
      {loadFailed ? (
        <QueryError what="the tool catalog" />
      ) : (
        <ToolGrid
          tools={(tools ?? []) as Tool[]}
          connectedToolIds={connectedToolIds}
          preselectToolId={preselectToolId}
        />
      )}
    </main>
  )
}
