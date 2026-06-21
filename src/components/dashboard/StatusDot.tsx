import type { ConnectionStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertCircle, CheckCircle2, CircleSlash, Clock } from "lucide-react"

// Shape-coded so status is distinguishable without relying on color alone.
const ICON: Record<ConnectionStatus, typeof CheckCircle2> = {
  active: CheckCircle2,
  stale: Clock,
  error: AlertCircle,
  disconnected: CircleSlash,
}

// Accessible colors (>=3:1 for non-text graphics on cream).
const COLOR: Record<ConnectionStatus, string> = {
  active: "text-[var(--healthy)]",
  stale: "text-[var(--low-text)]",
  error: "text-[var(--dry)]",
  disconnected: "text-[var(--ink-3)]",
}

const LABEL: Record<ConnectionStatus, string> = {
  active: "Active",
  stale: "Stale",
  error: "Error",
  disconnected: "Disconnected",
}

export function StatusDot({ status }: { status: ConnectionStatus }) {
  const Icon = ICON[status]
  return (
    <span
      role="img"
      aria-label={LABEL[status]}
      className={cn("inline-flex", COLOR[status])}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  )
}
