import type { EffectiveStatus } from "@/lib/balance-status"
import { cn } from "@/lib/utils"

const LEVEL_STYLE = {
  healthy: "bg-[var(--healthy-bg)] text-[var(--healthy-text)]",
  low: "bg-[var(--low-bg)] text-[var(--low-text)]",
  critical: "bg-[var(--dry-bg)] text-[var(--dry)]",
} as const

const LEVEL_LABEL = {
  healthy: "Healthy",
  low: "Low",
  critical: "Critical",
} as const

const CONN_STYLE = {
  stale: "bg-[var(--low-bg)] text-[var(--low-text)]",
  error: "bg-[var(--dry-bg)] text-[var(--dry)]",
  disconnected: "bg-[var(--cream-3)] text-[var(--ink-3)]",
} as const

const CONN_LABEL = {
  stale: "Stale reading",
  error: "Error",
  disconnected: "Disconnected",
} as const

// Neutral "no reading yet" treatment - grey, not green, not a warning color.
const NODATA_STYLE = "bg-[var(--cream-3)] text-[var(--ink-3)]"
const NODATA_LABEL = "No data"

export function StatusPill({ status }: { status: EffectiveStatus }) {
  const style =
    status.kind === "level"
      ? LEVEL_STYLE[status.level]
      : status.kind === "connection"
        ? CONN_STYLE[status.status]
        : NODATA_STYLE
  const label =
    status.kind === "level"
      ? LEVEL_LABEL[status.level]
      : status.kind === "connection"
        ? CONN_LABEL[status.status]
        : NODATA_LABEL
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 font-mono text-xs font-medium uppercase tracking-wide",
        style
      )}
    >
      {label}
    </span>
  )
}

// Small corner dot color matching the effective status (for the logo tile).
export function statusDotClass(status: EffectiveStatus): string {
  // Neutral grey when there is no reading yet.
  if (status.kind === "nodata") return "bg-[var(--ink-4)]"
  if (status.kind === "connection") {
    return status.status === "disconnected"
      ? "bg-[var(--ink-4)]"
      : "bg-[var(--dry)]"
  }
  return {
    healthy: "bg-[var(--healthy)]",
    low: "bg-[var(--canary)]",
    critical: "bg-[var(--dry)]",
  }[status.level]
}
