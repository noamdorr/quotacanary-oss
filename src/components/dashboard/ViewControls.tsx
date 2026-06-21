"use client"

import type { ViewMode } from "@/lib/types"
import { cn } from "@/lib/utils"

export type StatusFilter = "all" | "attention" | "healthy" | "low" | "critical"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "healthy", label: "Healthy" },
  { value: "low", label: "Low" },
  { value: "critical", label: "Critical" },
]

export function ViewControls({
  view,
  onViewChange,
  statusFilter,
  onStatusChange,
}: {
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  statusFilter: StatusFilter
  onStatusChange: (s: StatusFilter) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            Status: {o.label}
          </option>
        ))}
      </select>

      <div className="flex rounded-lg bg-muted p-0.5">
        {(["table", "cards"] as ViewMode[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
              view === v
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}
