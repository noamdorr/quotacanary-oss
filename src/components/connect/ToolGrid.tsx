"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Tool } from "@/lib/types"
import { Check, Plus, Search, ShieldCheck } from "lucide-react"
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
  const connectedCount = connected.size

  const filtered = useMemo(
    () =>
      tools.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())),
    [tools, query]
  )

  return (
    <div className="qc-connect-shell space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-[var(--cream-2)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${tools.length} tools…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 max-w-none bg-[var(--cream)] pr-3 pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--cream)] px-2.5">
            <Check className="h-3.5 w-3.5 text-[var(--healthy-text)]" />
            {connectedCount} connected
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--cream)] px-2.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            read-only checks
          </span>
        </div>
        <Button variant="secondary" onClick={() => setRequestOpen(true)}>
          <Plus className="h-4 w-4" />
          Request a tool
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((tool) => {
          const isConnected = connected.has(tool.id)
          const poolCount = tool.pools?.length ?? 1
          const detail =
            tool.category ??
            (poolCount > 1 ? `${poolCount} balances` : "Balance check")
          return (
            <div
              key={tool.id}
              className={`qc-connect-card flex min-h-[216px] flex-col gap-4 rounded-lg border border-border/60 bg-card p-4 text-left ${
                isConnected ? "qc-connect-card--connected" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="qc-connect-card__logo flex h-12 w-12 items-center justify-center rounded-md bg-secondary text-lg font-bold">
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
                <span className="qc-connect-card__status inline-flex items-center gap-1 rounded-full border border-border/60 bg-secondary px-2 py-1 text-xs text-muted-foreground">
                  {isConnected ? (
                    <>
                      <Check className="h-3 w-3 text-[var(--healthy-text)]" />
                      Connected
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3 w-3" />
                      Read-only
                    </>
                  )}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{tool.name}</p>
                <p className="mt-1 max-h-8 overflow-hidden text-xs leading-4 text-muted-foreground">
                  {detail}
                </p>
              </div>
              {isConnected ? (
                <div className="mt-auto flex w-full gap-2">
                  <Button
                    nativeButton={false}
                    render={<Link href={`/tools/${tool.id}`} />}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                  >
                    View tool
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => setConnectTarget(tool)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add key
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  className="mt-auto w-full"
                  onClick={() => setConnectTarget(tool)}
                >
                  Connect tool
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
