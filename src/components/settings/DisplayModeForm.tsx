"use client"

import { Button } from "@/components/ui/button"
import { setDisplayMode } from "@/lib/actions/connections"
import type { DisplayMode } from "@/lib/types"
import { useTransition } from "react"

export function DisplayModeForm({ current }: { current: DisplayMode }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex gap-2">
      {(["flat", "grouped"] as DisplayMode[]).map((mode) => (
        <Button
          key={mode}
          size="sm"
          variant={current === mode ? "default" : "secondary"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setDisplayMode(mode)
            })
          }
        >
          {mode === "flat" ? "Flat" : "Grouped by tag"}
        </Button>
      ))}
    </div>
  )
}
