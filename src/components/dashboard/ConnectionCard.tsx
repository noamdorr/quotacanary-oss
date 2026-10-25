"use client"

import { formatBalance } from "@/lib/format"
import { assessPool } from "@/lib/pool-assessment"
import type { PoolRow } from "@/lib/pool-rows"
import { runwayLabel } from "@/lib/runway-copy"
import { cn } from "@/lib/utils"
import { warnBelowSummary } from "@/lib/warn-below-summary"
import { Pencil } from "lucide-react"
import { Sparkline } from "./Sparkline"
import { StatusPill, statusDotClass } from "./StatusPill"

export function ConnectionCard({
  row,
  rowKey,
  highlighted = false,
  onOpen,
}: {
  row: PoolRow
  rowKey?: string
  highlighted?: boolean
  onOpen: () => void
}) {
  const { connection: c, pool } = row
  const { status, tone, atRisk, eta } = assessPool(row)
  const warn = pool ? warnBelowSummary(c, pool) : null
  const warnMeta = [warn?.source, warn?.detail].filter(Boolean).join(" · ")
  const balanceText = pool
    ? pool.balanceLimit != null
      ? `${formatBalance(pool.balance, pool.unit)} / ${formatBalance(pool.balanceLimit, pool.unit)}`
      : formatBalance(pool.balance, pool.unit)
    : "-"

  return (
    <button
      type="button"
      data-pool-row-key={rowKey}
      onClick={onOpen}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/40",
        highlighted &&
          "border-[var(--canary)] bg-[var(--canary-tint)]/45 ring-2 ring-[var(--canary)]/35"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-bold">
          {c.tool.logo_url ? (
            <img
              src={c.tool.logo_url}
              alt=""
              className="h-4 w-4 object-contain"
            />
          ) : (
            c.tool.name.charAt(0)
          )}
          <span
            aria-hidden="true"
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
              statusDotClass(status)
            )}
          />
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {c.name}
        </span>
        <StatusPill status={status} />
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums text-foreground">
          {balanceText}
        </p>
        <p className="text-xs text-muted-foreground">
          {pool?.label ?? "First reading pending"}
        </p>
        {eta && (
          <p
            className={cn(
              "font-mono text-xs",
              tone === "critical"
                ? "text-[var(--dry)]"
                : tone === "low"
                  ? "text-[var(--low-text)]"
                  : "text-muted-foreground"
            )}
          >
            {runwayLabel(eta)}
          </p>
        )}
      </div>
      <Sparkline
        values={(pool?.history ?? []).map((h) => h.balance)}
        tone={tone}
        className="h-4"
      />
      {/* The whole card opens the drawer; this line says what it lets you change. */}
      {warn && (
        <span className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{warn.text}</span>
            {warnMeta && ` · ${warnMeta}`}
          </span>
          <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </span>
      )}
    </button>
  )
}
