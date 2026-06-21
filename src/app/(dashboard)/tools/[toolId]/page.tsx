import { AddConnectionButton } from "@/components/tools/AddConnectionButton"
import { ConnectionRow } from "@/components/tools/ConnectionRow"
import { listConnectionsForTool } from "@/lib/db/connections"
import { createClient } from "@/lib/supabase/server"
import type { Tool } from "@/lib/types"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ toolId: string }>
}) {
  const { toolId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: tool } = await supabase
    .from("tools")
    .select("*")
    .eq("id", toolId)
    .single()
  if (!tool) notFound()

  const connections = await listConnectionsForTool(supabase, user.id, toolId)

  return (
    <main className="flex-1 p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tool.name}</h1>
        <AddConnectionButton tool={tool as Tool} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {connections.map((c) => (
          <ConnectionRow key={c.id} connection={c} />
        ))}
      </div>
    </main>
  )
}
