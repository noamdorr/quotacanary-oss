"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

// Rendered in place of a section whose query failed. The alternative that used
// to be everywhere - coalescing the error away with `?? []` - renders a
// confident empty state for a question the database never answered, so "we
// could not check" reads to the user as "you have none".
export function QueryError({ what }: { what: string }) {
  const router = useRouter()
  const [retrying, startRetry] = useTransition()

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm font-medium text-foreground">
          Couldn&apos;t load {what}.
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={retrying}
        onClick={() => startRetry(() => router.refresh())}
        className="shrink-0 self-start sm:self-auto"
      >
        <RefreshCw
          className={cn("h-3.5 w-3.5", retrying && "motion-safe:animate-spin")}
        />
        {retrying ? "Retrying…" : "Try again"}
      </Button>
    </div>
  )
}
