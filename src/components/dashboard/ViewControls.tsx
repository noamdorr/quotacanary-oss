"use client"

import type { SortDir, SortKey } from "@/lib/sort-connections"
import type { ViewMode } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp } from "lucide-react"

export type StatusFilter = "all" | "attention" | "healthy" | "low" | "critical"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attention", label: "Needs attention" },
  { value: "healthy", label: "Healthy" },
  { value: "low", label: "Low" },
  { value: "critical", label: "Critical" },
]

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "name", label: "Connection" },
  { value: "balance", label: "Balance" },
  { value: "updated", label: "Updated" },
]

export function ViewControls({
  view,
  onViewChange,
  statusFilter,
  onStatusChange,
  sortKey,
  sortDir,
  onSort,
}: {
  view: ViewMode
  onViewChange: (v: ViewMode) => void
  statusFilter: StatusFilter
  onStatusChange: (s: StatusFilter) => void
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
}) {
  return (
    <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[auto_auto]">
      <select
        aria-label="Filter by status"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground sm:w-auto"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            Status: {o.label}
          </option>
        ))}
      </select>

      <div className="flex min-w-0 gap-2 xl:hidden">
        <select
          aria-label="Sort by"
          value={sortKey}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground sm:w-auto"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Sort: {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Sort direction: ${sortDir === "asc" ? "ascending" : "descending"}`}
          onClick={() => onSort(sortKey)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground outline-none hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {sortDir === "asc" ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="hidden rounded-lg bg-muted p-0.5 xl:flex">
        {(["table", "cards"] as ViewMode[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
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
