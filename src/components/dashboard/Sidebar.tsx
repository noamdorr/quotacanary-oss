"use client"

import { cn } from "@/lib/utils"
import { Bell, Cable, LayoutDashboard, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV = [
  {
    href: "/dashboard",
    label: "Dashboard",
    short: "Dashboard",
    Icon: LayoutDashboard,
  },
  { href: "/connect", label: "Connect a tool", short: "Connect", Icon: Cable },
  { href: "/alerts", label: "Alerts", short: "Alerts", Icon: Bell },
  { href: "/settings", label: "Settings", short: "Settings", Icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Desktop: vertical rail. Hidden below md, where MobileNav takes over.
export function Sidebar() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Primary"
      className="hidden w-56 flex-col gap-1 border-r border-border/50 p-4 md:flex"
    >
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        )
      })}
      <Link
        href="/security"
        aria-current={isActive(pathname, "/security") ? "page" : undefined}
        className="mt-auto px-3 py-2 text-xs text-muted-foreground/70 hover:text-foreground"
      >
        Security & privacy
      </Link>
    </nav>
  )
}

// Mobile: fixed bottom tab bar. Hidden at md+, where Sidebar takes over.
export function MobileNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch justify-around border-t border-border/50 bg-background md:hidden"
    >
      {NAV.map(({ href, short, Icon }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 px-2 text-[11px] font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {short}
          </Link>
        )
      })}
    </nav>
  )
}
