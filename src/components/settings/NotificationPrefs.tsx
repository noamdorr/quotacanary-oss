"use client"

import { Button } from "@/components/ui/button"
import { setNotifyMode } from "@/lib/actions/connections"
import { runClientAction } from "@/lib/client-action"
import type { NotifyMode } from "@/lib/types"
import { useState, useTransition } from "react"

const MODES: { value: NotifyMode; label: string }[] = [
  { value: "low_and_critical", label: "Low + critical" },
  { value: "critical", label: "Only when critical" },
  { value: "off", label: "Off" },
]

export function NotificationPrefs({ current }: { current: NotifyMode }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <Button
            key={m.value}
            size="sm"
            variant={current === m.value ? "default" : "secondary"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await runClientAction(() => setNotifyMode(m.value))
                setError(res.ok ? null : res.error)
              })
            }
          >
            {m.label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--dry)]">
          {error}
        </p>
      )}
    </div>
  )
}
