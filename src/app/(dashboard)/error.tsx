"use client"

import { Canary } from "@/components/brand/Canary"
import { Button } from "@/components/ui/button"
import { useEffect } from "react"

// Group-level boundary for the queries that gate a whole page (the dashboard's
// profile row, a tool lookup). It keeps the sidebar and header around the
// failure, where the root boundary takes over the full viewport and makes one
// bad query look like the whole app fell over.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-8 text-center">
      <Canary mood="dry" size={56} />
      <h1 className="text-xl font-semibold text-foreground">
        This page didn&apos;t load
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Nothing was changed, and nothing is wrong with your account.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  )
}
