import { logout } from "@/app/(auth)/login/actions"
import { MobileNav, Sidebar } from "@/components/dashboard/Sidebar"
import { Button } from "@/components/ui/button"
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border/50 px-6">
        <Link
          href="/dashboard"
          className="qc-nav-logo rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="QuotaCanary dashboard"
        >
          <img
            src="/logo.png"
            alt="QuotaCanary"
            width="122"
            height="27"
            style={{ width: 122, height: 27 }}
          />
        </Link>
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
          >
            Sign out
          </Button>
        </form>
      </header>
      <div className="flex flex-1">
        <Sidebar />
        {/* pb on mobile clears the fixed bottom tab bar (MobileNav). */}
        <div className="flex flex-1 flex-col pb-16 md:pb-0">{children}</div>
      </div>
      <MobileNav />
    </div>
  )
}
