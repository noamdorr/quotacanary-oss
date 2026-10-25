"use client"

import { Button } from "@/components/ui/button"
import { formatSuccessPoolBalance } from "@/lib/dashboard-connection-success"
import type { PoolRow } from "@/lib/pool-rows"
import {
  WARN_BELOW_FIRST_RUN_HINT,
  warnBelowSummary,
} from "@/lib/warn-below-summary"
import { CheckCircle2, Pencil, X } from "lucide-react"
import { FirstToolConfetti } from "./FirstToolConfetti"

export function ConnectionSuccessCard({
  rows,
  celebrate = false,
  onOpenRow,
  onDismiss,
}: {
  rows: PoolRow[]
  celebrate?: boolean
  onOpenRow: (row: PoolRow) => void
  onDismiss: () => void
}) {
  if (rows.length === 0) return null

  const connection = rows[0].connection

  return (
    <section
      aria-live="polite"
      className="relative overflow-hidden rounded-xl border border-[var(--healthy)]/25 bg-[var(--healthy-bg)]/80 p-4 shadow-sm"
    >
      {celebrate && <FirstToolConfetti />}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--healthy)]/15 text-[var(--healthy-text)] ring-1 ring-inset ring-[var(--healthy)]/25">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {connection.name} connected
              </p>
              <p className="text-sm text-[var(--ink-2)]">
                First balance read is in.
              </p>
              {/* First connection only: the one place that says a warning
                  number exists and can be changed. */}
              {celebrate && (
                <p className="text-sm text-[var(--ink-2)]">
                  {WARN_BELOW_FIRST_RUN_HINT}
                </p>
              )}
            </div>
            <dl className="flex flex-wrap gap-2">
              {rows.map((row) => {
                const warn = row.pool
                  ? warnBelowSummary(row.connection, row.pool)
                  : null
                return (
                  <div
                    key={row.pool?.creditType ?? "pending"}
                    className="rounded-lg border border-[var(--healthy)]/20 bg-background/75 px-3 py-2"
                  >
                    <dt className="text-xs text-muted-foreground">
                      {row.pool?.label ?? "Balance"}
                    </dt>
                    <dd className="text-sm font-bold tabular-nums text-foreground">
                      {row.pool
                        ? formatSuccessPoolBalance(row.pool)
                        : "First reading pending"}
                      {warn && (
                        <button
                          type="button"
                          onClick={() => onOpenRow(row)}
                          aria-label={warn.label}
                          className="mt-1 flex items-center gap-1 rounded-sm text-xs font-normal text-[var(--ink-2)] underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {warn.text}
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 md:pt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDismiss}
            aria-label="Close connection confirmation"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  )
}
