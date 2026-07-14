"use client"

import { Button } from "@/components/ui/button"
import { setAlert } from "@/lib/actions/connections"
import { runClientAction } from "@/lib/client-action"
import type { ConnectionWithBalance } from "@/lib/types"
import { useState, useTransition } from "react"

export function AlertRow({
  connection,
}: {
  connection: ConnectionWithBalance
}) {
  const [enabled, setEnabled] = useState(connection.alert_enabled)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function toggle() {
    const next = !enabled
    setEnabled(next)
    setError(null)
    startTransition(async () => {
      const res = await runClientAction(() => setAlert(connection.id, next))
      if (!res.ok) {
        // Roll back the optimistic flip so the button reflects reality.
        setEnabled(!next)
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-4">
      <div>
        <p className="font-medium">{connection.name}</p>
        {connection.name !== connection.tool.name && (
          <p className="text-xs text-muted-foreground">
            {connection.tool.name}
          </p>
        )}
        {connection.notified_level !== "none" && (
          <p className="text-xs text-[var(--low-text)]">
            Alerted
            {connection.alert_fired_at
              ? ` ${new Date(connection.alert_fired_at).toLocaleDateString()}`
              : ""}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <Button
          size="sm"
          variant={enabled ? "default" : "secondary"}
          disabled={pending}
          onClick={toggle}
        >
          {enabled ? "On" : "Off"}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-[var(--dry)]">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
