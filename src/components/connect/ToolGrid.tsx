"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Tool } from "@/lib/types"
import { Check } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ConnectModal } from "./ConnectModal"
import { RequestToolDialog } from "./RequestToolDialog"

type Props = {
  tools: Tool[]
  connectedToolIds: string[]
}

export function ToolGrid({ tools, connectedToolIds }: Props) {
  const [query, setQuery] = useState("")
  const [connectTarget, setConnectTarget] = useState<Tool | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const connected = new Set(connectedToolIds)

  const filtered = useMemo(
    () =>
      tools.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())),
    [tools, query]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Search tools…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="secondary" onClick={() => setRequestOpen(true)}>
          Request a tool
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((tool) => {
          const isConnected = connected.has(tool.id)
          return (
            <div
              key={tool.id}
              className="flex flex-col items-center gap-3 rounded-lg border border-border/60 bg-card p-5 text-center"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary text-lg font-bold">
                {tool.logo_url ? (
                  <img
                    src={tool.logo_url}
                    alt=""
                    className="h-8 w-8 object-contain"
                  />
                ) : (
                  tool.name.charAt(0)
                )}
              </div>
              <div>
                <p className="font-semibold text-foreground">{tool.name}</p>
              </div>
              {isConnected ? (
                <div className="flex w-full gap-2">
                  <Button
                    nativeButton={false}
                    render={<Link href={`/tools/${tool.id}`} />}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                  >
                    <span className="flex items-center justify-center gap-1">
                      <Check className="h-4 w-4" /> Connected
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => setConnectTarget(tool)}
                  >
                    + New
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => setConnectTarget(tool)}
                >
                  Connect
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {connectTarget && (
        <ConnectModal
          tool={connectTarget}
          open={connectTarget !== null}
          onOpenChange={(open) => !open && setConnectTarget(null)}
        />
      )}
      <RequestToolDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  )
}
