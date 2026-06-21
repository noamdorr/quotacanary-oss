import { ToolGrid } from "@/components/connect/ToolGrid"
import { createClient } from "@/lib/supabase/server"
import type { Tool } from "@/lib/types"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function ConnectPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [{ data: tools }, { data: connections }] = await Promise.all([
    supabase.from("tools").select("*").eq("is_active", true).order("name"),
    supabase.from("connections").select("tool_id").eq("user_id", user.id),
  ])

  const connectedToolIds = [
    ...new Set((connections ?? []).map((c) => c.tool_id)),
  ]

  return (
    <main className="flex-1 p-8">
      <h1 className="mb-6 text-2xl font-bold">Connect a tool</h1>
      <ToolGrid
        tools={(tools ?? []) as Tool[]}
        connectedToolIds={connectedToolIds}
      />
    </main>
  )
}
