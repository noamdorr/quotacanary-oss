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
        <div className="w-full max-w-md">{children}</div>
      </div>
      <AuthBrandPanel />
    </div>
  )
}
