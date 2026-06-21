"use client"

import { Button } from "@/components/ui/button"
import { setAlert } from "@/lib/actions/connections"
import type { ConnectionWithBalance } from "@/lib/types"
import { useState, useTransition } from "react"

export function AlertRow({
  connection,
}: {
  connection: ConnectionWithBalance
}) {
  const [enabled, setEnabled] = useState(connection.alert_enabled)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      await setAlert(connection.id, next)
    })
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-4">
      <div>
        <p className="font-medium">{connection.name}</p>
        <p className="text-xs text-muted-foreground">{connection.tool.name}</p>
        <p className="text-xs text-muted-foreground">
          Alerts you when a tracked balance crosses your warning threshold. Set
          those thresholds from the dashboard.
        </p>
        {connection.notified_level !== "none" && (
          <p className="text-xs text-[var(--low-text)]">
            Alerted
            {connection.alert_fired_at
              ? ` ${new Date(connection.alert_fired_at).toLocaleDateString()}`
              : ""}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant={enabled ? "default" : "secondary"}
        disabled={pending}
        onClick={toggle}
      >
        {enabled ? "On" : "Off"}
      </Button>
    </div>
  )
}
