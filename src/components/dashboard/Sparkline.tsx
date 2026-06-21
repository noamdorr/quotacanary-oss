type Tone = "healthy" | "low" | "critical" | "neutral"

const FILL: Record<Tone, string> = {
  healthy: "bg-[var(--healthy)]",
  low: "bg-[var(--canary)]",
  critical: "bg-[var(--dry)]",
  neutral: "bg-[var(--ink-4)]",
}

// `values` are most-recent-first (as stored in history); we render oldest→newest.
export function Sparkline({
  values,
  tone = "neutral",
  className,
}: {
  values: number[]
  tone?: Tone
  className?: string
}) {
  if (values.length < 2) {
    return <div className={`h-5 ${className ?? ""}`} aria-hidden />
  }
  const ordered = [...values].reverse()
  const max = Math.max(...ordered)
  const min = Math.min(...ordered)
  const span = max - min || 1
  return (
    <div
      className={`flex h-5 items-end gap-[2px] ${className ?? ""}`}
      aria-hidden
    >
      {ordered.map((v, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and values may repeat
          key={i}
          className={`w-1 rounded-[1px] ${FILL[tone]}`}
          style={{ height: `${10 + ((v - min) / span) * 90}%` }}
        />
      ))}
    </div>
  )
}
