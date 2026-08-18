"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { categoryLabel, toolMatchesQuery } from "@/lib/marketing/tool-directory"
import { trackPlausibleEvent } from "@/lib/plausible-events"
import type { Tool } from "@/lib/types"
import { Check, Plus, Search, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ConnectModal } from "./ConnectModal"
import { RequestToolDialog } from "./RequestToolDialog"

type Props = {
  tools: Tool[]
  connectedToolIds: string[]
  // A catalog id the user arrived wanting to connect, already checked against
  // the catalog by the page. Opens its credential modal straight away.
  preselectToolId?: string | null
}

export function ToolGrid({ tools, connectedToolIds, preselectToolId }: Props) {
  const [query, setQuery] = useState("")
  const [connectTarget, setConnectTarget] = useState<Tool | null>(
    () => tools.find((t) => t.id === preselectToolId) ?? null
  )

  const [requestOpen, setRequestOpen] = useState(false)
  const connected = new Set(connectedToolIds)
  const connectedCount = connected.size

  // Completion and abandonment for the directory -> sign-in -> connect path
  // are the gap between these two events. trackPlausibleEvent is a no-op
  // wherever the script is not loaded (self-host, dev), so this stays inert
  // unless the hosted deployment is measuring.
  useEffect(() => {
    if (preselectToolId) trackPlausibleEvent("Tool Intent Preselected")
  }, [preselectToolId])

  const filtered = useMemo(
    () => tools.filter((tool) => toolMatchesQuery(tool, query)),
    [tools, query]
  )

  return (
    <div className="qc-connect-shell space-y-6">
      <div className="flex flex-col gap-3 rounded-[calc(var(--radius)+0.75rem)] border border-border/60 bg-[var(--cream-2)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${tools.length} tools…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 max-w-none rounded-[var(--radius)] bg-[var(--cream)] pr-3 pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-[var(--cream)] px-2.5 tabular-nums">
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/60 py-16 text-center">
          {/* The picker stays mascot-free by design; a muted glyph carries the
              empty state instead. See connect-flow-polish-source.test.ts. */}
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <Search className="h-5 w-5 text-muted-foreground" />
          </span>
          {tools.length === 0 ? (
            <>
              <p className="font-semibold text-foreground">
                The tool catalog is empty
              </p>
              <p className="max-w-sm text-pretty text-sm text-muted-foreground">
                Nothing to connect yet. Tell us what you run and we&apos;ll add
                it.
              </p>
              <Button variant="secondary" onClick={() => setRequestOpen(true)}>
                <Plus className="h-4 w-4" />
                Request a tool
              </Button>
            </>
          ) : (
            <>
              <p className="max-w-sm font-semibold break-words text-foreground">
                No tools match “{query}”
              </p>
              <p className="max-w-sm text-pretty text-sm text-muted-foreground tabular-nums">
                {tools.length} tools in the catalog, none of them by that name.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="secondary" onClick={() => setQuery("")}>
                  Clear search
                </Button>
                <Button onClick={() => setRequestOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Request a tool
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((tool) => {
            const isConnected = connected.has(tool.id)
            const poolCount = tool.pools?.length ?? 1
            const detail =
              (tool.category ? categoryLabel(tool.category) : null) ??
              (poolCount > 1 ? `${poolCount} balances` : "Balance check")
            return (
              <div
                key={tool.id}
                className={`qc-connect-card flex min-h-[216px] flex-col gap-4 rounded-lg border border-border/60 bg-card p-4 text-left ${
                  isConnected ? "qc-connect-card--connected" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="qc-connect-card__logo flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary text-lg font-bold">
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
                  <p className="mt-1 max-h-8 overflow-hidden text-pretty text-xs leading-4 text-muted-foreground">
                    {detail}
                  </p>
                </div>
                {isConnected ? (
                  <div className="mt-auto flex w-full flex-wrap gap-2">
                    <Button
                      nativeButton={false}
                      render={<Link href={`/tools/${tool.id}`} />}
                      variant="secondary"
                      size="sm"
                      className="min-w-[5.5rem] flex-1"
                    >
                      View tool
                    </Button>
                    <Button
                      size="sm"
                      className="min-w-[5.5rem] flex-1"
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
      )}

      {connectTarget && (
        <ConnectModal
          tool={connectTarget}
          open={connectTarget !== null}
          onOpenChange={(open) => !open && setConnectTarget(null)}
          onConnected={(toolId) => {
            if (toolId === preselectToolId)
              trackPlausibleEvent("Tool Intent Connected")
          }}
        />
      )}
      <RequestToolDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  )
}
