"use client"

import { formatBalance } from "@/lib/format"
import { assessPool } from "@/lib/pool-assessment"
import type { PoolRow } from "@/lib/pool-rows"
import { runwayLabel } from "@/lib/runway-copy"
import { cn } from "@/lib/utils"
import { warnBelowSummary } from "@/lib/warn-below-summary"
import { ExternalLink } from "lucide-react"
import { Sparkline } from "./Sparkline"
import { StatusPill, statusDotClass } from "./StatusPill"

function formatWhen(iso: string | null): string {
  if (!iso) return "never"
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function formatPoolBalance(
  balance: number,
  limit: number | null,
  unit: string
): string {
  return limit != null
    ? `${formatBalance(balance, unit)} / ${formatBalance(limit, unit)}`
    : formatBalance(balance, unit)
}

export const ROW_GRID =
  "grid grid-cols-[32px_minmax(180px,1.15fr)_minmax(120px,0.75fr)_112px_132px_minmax(160px,0.9fr)_112px] items-center gap-3"

export function ConnectionRow({
  row,
  rowKey,
  active,
  highlighted = false,
  onOpen,
}: {
  row: PoolRow
  rowKey?: string
  active: boolean
  highlighted?: boolean
  onOpen: () => void
}) {
  const { connection: c, pool } = row
  const { status, tone, atRisk, eta } = assessPool(row)
  const warn = pool ? warnBelowSummary(c, pool) : null

  return (
    <div
      className={cn(
        ROW_GRID,
        "relative w-full border-l-[3px] px-5 py-3 text-left transition-colors hover:bg-muted/60",
        active ? "border-l-foreground bg-muted/60" : "border-l-transparent",
        highlighted &&
          "bg-[var(--canary-tint)]/35 before:pointer-events-none before:absolute before:inset-1 before:rounded-lg before:border before:border-[var(--canary)]/60 before:bg-[var(--canary-tint)]/20 before:content-['']"
      )}
    >
      {/* Overlay button = row-wide click target without nesting the "Top up" link inside a button. */}
      <button
        type="button"
        data-pool-row-key={rowKey}
        onClick={onOpen}
        aria-label={`Open ${c.name} details`}
        className="absolute inset-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      />
      <span className="pointer-events-none relative flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs font-bold text-secondary-foreground">
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

      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {c.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {pool?.label ?? "First reading pending"}
        </span>
      </span>

      <Sparkline
        values={(pool?.history ?? []).map((h) => h.balance)}
        tone={tone}
      />

      <span>
        <StatusPill status={status} />
      </span>

      <span className="min-w-0 leading-tight">
        {warn ? (
          <>
            {/* A real button above the row overlay, so the number is its own
                labelled, focusable way into the drawer. */}
            <button
              type="button"
              onClick={onOpen}
              aria-label={warn.label}
              className="relative rounded-sm text-sm font-medium tabular-nums text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {warn.number ?? "Set a warning"}
            </button>
            {warn.source && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {warn.source}
              </span>
            )}
            {warn.detail && (
              <span className="block truncate text-xs text-muted-foreground">
                {warn.detail}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </span>

      <span className="flex min-w-0 flex-col items-end gap-0.5 text-right leading-tight">
        <span className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground">
          {pool
            ? formatPoolBalance(pool.balance, pool.balanceLimit, pool.unit)
            : "-"}
        </span>
        {eta && (
          <span
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
          </span>
        )}
      </span>

      <span className="flex justify-end text-right">
        {atRisk && c.tool.topup_url ? (
          <a
            href={c.tool.topup_url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-flex rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"
          >
            <span className="flex items-center gap-1">
              Top up <ExternalLink className="h-3 w-3" />
            </span>
          </a>
        ) : (
          // formatWhen reads Date.now(), so the server render and the hydrating
          // client render land in different minute buckets. Same fix as
          // AlertDestinations' Moment.
          <span
            className="text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            {formatWhen(pool?.recorded_at ?? null)}
          </span>
        )}
      </span>
    </div>
  )
}
