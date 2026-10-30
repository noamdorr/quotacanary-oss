import { LogoMark } from "@/components/brand/LogoMark"

export function PublicNav() {
  return (
    <header className="container flex flex-wrap items-center justify-between gap-4 py-6">
      <a href="/" className="flex items-center gap-2 font-medium">
        <LogoMark height={24} />
        QuotaCanary
      </a>
      <nav aria-label="Main" className="flex flex-wrap gap-5 text-sm">
        <a href="/dashboard">Dashboard</a>
        <a href="/docs">Docs</a>
        <a href="/security">Security</a>
      </nav>
    </header>
  )
}
