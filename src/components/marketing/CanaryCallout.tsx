import { Canary, type CanaryMood } from "@/components/brand/Canary"
import type { CSSProperties } from "react"

export function CanaryCallout({
  line,
  mood = "singing",
  size = 124,
  className,
  style,
  revealOnHover = false,
}: {
  line: string
  mood?: CanaryMood
  size?: number
  className?: string
  style?: CSSProperties
  revealOnHover?: boolean
}) {
  return (
    <div
      className={`qc-canary-callout${revealOnHover ? " qc-canary-callout--reveal" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      tabIndex={revealOnHover ? 0 : undefined}
      role={revealOnHover ? "img" : undefined}
      aria-label={revealOnHover ? line : undefined}
    >
      <span
        className="qc-canary-callout__bubble"
        aria-hidden={revealOnHover ? true : undefined}
      >
        {line}
      </span>
      <span className="qc-canary-callout__bird">
        <Canary mood={mood} size={size} />
      </span>
    </div>
  )
}
