"use client"

import { Canary, type CanaryMood } from "@/components/brand/Canary"
import { effectiveStatus } from "@/lib/balance-status"
import { poolEta } from "@/lib/pool-eta"
import type { PoolRow } from "@/lib/pool-rows"
import { resolvePoolThresholds } from "@/lib/thresholds"
import { ExternalLink } from "lucide-react"
import { StatusPill } from "./StatusPill"

export function BurnRateHero({ row }: { row: PoolRow }) {
  if (!row.pool) return null

  const { connection: c, pool } = row
  const { low, critical } = resolvePoolThresholds(c, pool.creditType ?? "")
  const status = effectiveStatus({
    balance: pool.balance ?? null,
    low,
    critical,
    connectionStatus: c.status,
  })
  const tone = status.kind === "level" ? status.level : "neutral"
  const eta = poolEta(pool)
  // The bird plays by its own lore: quiet when everything is fine, singing
  // while a warning is live ("sings before the credits die"), belly-up once
  // the pool is actually empty, and wide-eyed when the reading can't be
  // trusted (stale/error connections).
  let mood: CanaryMood = "alert"
  if (status.kind === "level") {
    mood =
      status.level === "healthy"
        ? "perched"
        : (pool.balance ?? 1) <= 0
          ? "dry"
          : "singing"
  }
  // Brand gold (#ffc400 / canary-deep) fails contrast as text on the cream
  // card, so route the accent through the accessible status tokens.
  const accent = tone === "critical" ? "var(--dry)" : "var(--low-text)"

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-5 shadow-[0_1px_0_rgba(26,26,26,0.04),_0_2px_8px_rgba(26,26,26,0.06)]">
      {/* Eyebrow + canary mascot */}
      <div className="flex items-start justify-between gap-4">
        <span
          className="font-mono text-[11px] font-medium uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          Next to die
        </span>
        <div className="flex items-start gap-3">
          {c.tool.topup_url && (
            <a
              href={c.tool.topup_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-lg bg-foreground px-2.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Get more <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
          <Canary mood={mood} size={56} />
        </div>
      </div>

      {/* The verdict: which pool, and when it runs dry */}
      {eta && (
        <div className="mt-3">
          <p className="f-display text-4xl leading-tight text-foreground md:text-5xl">
            <em style={{ color: accent, fontStyle: "italic" }}>{eta.short}</em>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{eta.long}</p>
        </div>
      )}

      {/* Which tool is at risk */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-bold text-secondary-foreground">
          {c.tool.logo_url ? (
            <img
              src={c.tool.logo_url}
              alt=""
              className="h-4 w-4 object-contain"
            />
          ) : (
            c.tool.name.charAt(0)
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {c.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {pool.label}
          </span>
        </span>

        <StatusPill status={status} />
      </div>
    </div>
  )
}
