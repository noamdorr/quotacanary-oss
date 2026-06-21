"use client"

import { setViewMode } from "@/lib/actions/connections"
import { effectiveStatus } from "@/lib/balance-status"
import { connectionRowsForSuccess } from "@/lib/dashboard-connection-success"
import { mostAtRisk } from "@/lib/most-at-risk"
import { type PoolRow, toPoolRows } from "@/lib/pool-rows"
import {
  type SortDir,
  type SortKey,
  sortPoolRows,
} from "@/lib/sort-connections"
import { resolvePoolThresholds } from "@/lib/thresholds"
import type { ConnectionWithBalance, ViewMode } from "@/lib/types"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { BurnRateHero } from "./BurnRateHero"
import { ConnectionCard } from "./ConnectionCard"
import { ConnectionDrawer } from "./ConnectionDrawer"
import { ConnectionSuccessCard } from "./ConnectionSuccessCard"
import { ConnectionsTable, poolRowKey } from "./ConnectionsTable"
import { TagsBar } from "./TagsBar"
import { type StatusFilter, ViewControls } from "./ViewControls"

function matchesStatus(row: PoolRow, filter: StatusFilter): boolean {
  if (filter === "all") return true
  const { low, critical } = resolvePoolThresholds(
    row.connection,
    row.pool?.creditType ?? ""
  )
  const s = effectiveStatus({
    balance: row.pool?.balance ?? null,
    low,
    critical,
    connectionStatus: row.connection.status,
  })
  if (s.kind !== "level") return filter === "attention"
  if (filter === "attention") return s.level === "low" || s.level === "critical"
  return s.level === filter
}

export function DashboardClient({
  connections,
  defaultView = "table",
  recentConnectionId,
}: {
  connections: ConnectionWithBalance[]
  defaultView?: ViewMode
  recentConnectionId?: string | null
}) {
  const router = useRouter()
  const [activeTag, setActiveTag] = useState("All")
  const [view, setView] = useState<ViewMode>(defaultView)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sortKey, setSortKey] = useState<SortKey>("status")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [dismissedConnectionId, setDismissedConnectionId] = useState<
    string | null
  >(null)

  const allTags = useMemo(
    () => [...new Set(connections.flatMap((c) => c.tags))].sort(),
    [connections]
  )

  const visible = useMemo(() => {
    const byTag =
      activeTag === "All"
        ? connections
        : connections.filter((c) => c.tags.includes(activeTag))
    const rows = toPoolRows(byTag).filter((r) => matchesStatus(r, statusFilter))
    return sortPoolRows(rows, sortKey, sortDir)
  }, [connections, activeTag, statusFilter, sortKey, sortDir])

  const hero = useMemo(() => mostAtRisk(visible), [visible])
  const successRows = useMemo(
    () =>
      dismissedConnectionId === recentConnectionId
        ? []
        : connectionRowsForSuccess(connections, recentConnectionId),
    [connections, dismissedConnectionId, recentConnectionId]
  )
  const highlightedConnectionId =
    successRows.length > 0 ? recentConnectionId : null

  function changeView(v: ViewMode) {
    setView(v)
    void setViewMode(v)
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  function dismissSuccess() {
    setDismissedConnectionId(recentConnectionId ?? null)
    router.replace("/dashboard", { scroll: false })
  }

  const openRow = openKey
    ? (visible.find((r) => poolRowKey(r) === openKey) ?? null)
    : null

  // Shared by the card view and the table view's mobile fallback.
  const cards = visible.map((r) => (
    <ConnectionCard
      key={poolRowKey(r)}
      rowKey={poolRowKey(r)}
      row={r}
      highlighted={r.connection.id === highlightedConnectionId}
      onOpen={() => setOpenKey(poolRowKey(r))}
    />
  ))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <TagsBar tags={allTags} active={activeTag} onSelect={setActiveTag} />
        </div>
        <ViewControls
          view={view}
          onViewChange={changeView}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
        />
      </div>

      {successRows.length > 0 && (
        <ConnectionSuccessCard
          rows={successRows}
          celebrate={connections.length === 1}
          onDismiss={dismissSuccess}
        />
      )}

      {hero && <BurnRateHero row={hero} />}

      {view === "table" ? (
        <>
          {/* The table's fixed columns can't fit narrow screens, so below sm
              we fall back to the card layout (the designed mobile view). */}
          <div className="hidden sm:block">
            <ConnectionsTable
              rows={visible}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              activeKey={openKey}
              highlightedConnectionId={highlightedConnectionId}
              onOpen={(r) => setOpenKey(poolRowKey(r))}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:hidden">{cards}</div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards}
        </div>
      )}

      <ConnectionDrawer
        key={openKey}
        row={openRow}
        onClose={() => setOpenKey(null)}
      />
    </div>
  )
}
