import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel"
import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          {children}
          <div className="mt-4 flex flex-wrap justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground lg:hidden">
            <span className="rounded-lg border border-border/60 bg-secondary/50 px-2.5 py-2">
              Read-only access
            </span>
            <span className="rounded-lg border border-border/60 bg-secondary/50 px-2.5 py-2">
              No sends touched
            </span>
          </div>
        </div>
      </div>
      <AuthBrandPanel />
    </div>
  )
}
