"use client"

import { Button } from "@/components/ui/button"
import { markAlertEventRead } from "@/lib/actions/alerts"
import { runClientAction } from "@/lib/client-action"
import { useState, useTransition } from "react"

// Client island so the server-rendered alert list can surface a failed
// mark-read instead of silently swallowing it.
export function MarkReadButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const formData = new FormData()
            formData.set("id", eventId)
            const res = await runClientAction(() =>
              markAlertEventRead(formData)
            )
            setError(res.ok ? null : res.error)
          })
        }
      >
        Mark read
      </Button>
      {error && (
        <p role="alert" className="text-xs text-[var(--dry)]">
          {error}
        </p>
      )}
    </div>
  )
}
