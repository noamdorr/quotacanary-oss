"use client"

import type { PoolRow } from "@/lib/pool-rows"
import type { SortDir, SortKey } from "@/lib/sort-connections"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp } from "lucide-react"
import { ConnectionRow, ROW_GRID } from "./ConnectionRow"

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: null, label: "" },
  { key: "name", label: "Connection" },
  { key: null, label: "Trend" },
  { key: "status", label: "Status" },
  { key: "balance", label: "Balance" },
  { key: "updated", label: "Updated" },
]

export function poolRowKey(row: PoolRow): string {
  return `${row.connection.id}:${row.pool?.creditType ?? ""}`
}

export function ConnectionsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  activeKey,
  highlightedConnectionId,
  onOpen,
}: {
  rows: PoolRow[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  activeKey: string | null
  highlightedConnectionId?: string | null
  onOpen: (row: PoolRow) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div
        className={cn(
          ROW_GRID,
          "min-w-[1120px] border-b border-border bg-muted/50 px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
        )}
      >
        {COLUMNS.map((col) =>
          col.key ? (
            <button
              key={col.label}
              type="button"
              onClick={() => onSort(col.key as SortKey)}
              className={cn(
                "flex items-center gap-1 text-left uppercase",
                col.key === "balance" || col.key === "updated"
                  ? "justify-end"
                  : "",
                sortKey === col.key
                  ? "text-foreground"
                  : "hover:text-foreground"
              )}
            >
              {col.label}
              {sortKey === col.key &&
                (sortDir === "asc" ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                ))}
            </button>
          ) : (
            <span key={col.label || "spacer"}>{col.label}</span>
          )
        )}
      </div>
      <div className="min-w-[1120px] divide-y divide-border">
        {rows.map((row) => {
          const key = poolRowKey(row)
          return (
            <ConnectionRow
              key={key}
              rowKey={key}
              row={row}
              active={key === activeKey}
              highlighted={row.connection.id === highlightedConnectionId}
              onOpen={() => onOpen(row)}
            />
          )
        })}
      </div>
    </div>
  )
}
