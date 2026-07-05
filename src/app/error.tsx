"use client"

import { Canary } from "@/components/brand/Canary"
import { useEffect } from "react"

export default function ErrorBoundary({
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center">
      <Canary mood="dry" size={72} />
      <p className="eyebrow">Error</p>
      <h1 className="f-display text-4xl text-[var(--ink)] sm:text-5xl">
        Something broke. It wasn&apos;t you.
      </h1>
      <p className="max-w-md text-sm text-[var(--ink-3)]">
        An unexpected error stopped this page. Try again - if it keeps
        happening, it&apos;s on us.
      </p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <a href="/" className="btn btn-ghost">
          Back home
        </a>
      </div>
    </main>
  )
}
