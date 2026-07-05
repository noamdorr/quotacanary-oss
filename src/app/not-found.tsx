import { Canary } from "@/components/brand/Canary"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Page not found - QuotaCanary",
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center">
      <Canary mood="sleepy" size={72} />
      <p className="eyebrow">404</p>
      <h1 className="f-display text-4xl text-[var(--ink)] sm:text-5xl">
        This page doesn&apos;t exist.
      </h1>
      <p className="max-w-md text-sm text-[var(--ink-3)]">
        Maybe it moved, maybe the link went stale, maybe it never existed. The
        bird checked twice.
      </p>
      <Link href="/" className="btn btn-primary">
        Back home
      </Link>
    </main>
  )
}
