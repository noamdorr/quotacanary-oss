"use client"

import { cn } from "@/lib/utils"

type Props = {
  tags: string[]
  active: string
  onSelect: (tag: string) => void
}

export function TagsBar({ tags, active, onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {["All", ...tags].map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onSelect(tag)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs transition-colors",
            active === tag
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          )}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
