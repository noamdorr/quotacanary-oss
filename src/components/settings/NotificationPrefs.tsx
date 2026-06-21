"use client"

import { Button } from "@/components/ui/button"
import { setNotifyMode } from "@/lib/actions/connections"
import type { NotifyMode } from "@/lib/types"
import { useTransition } from "react"

const MODES: { value: NotifyMode; label: string }[] = [
  { value: "low_and_critical", label: "Low + critical" },
  { value: "critical", label: "Only when critical" },
  { value: "off", label: "Off" },
]

export function NotificationPrefs({ current }: { current: NotifyMode }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap gap-2">
      {MODES.map((m) => (
        <Button
          key={m.value}
          size="sm"
          variant={current === m.value ? "default" : "secondary"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setNotifyMode(m.value)
            })
          }
        >
          {m.label}
        </Button>
      ))}
    </div>
  )
}
