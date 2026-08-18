"use client"

import { Button } from "@/components/ui/button"
import { Check, Copy } from "lucide-react"
import { useState } from "react"

// Shared by the two one-time secret reveals in Settings (API tokens and
// webhook signing secrets): both show a value the user can never read again,
// so the copy affordance has to behave identically in each.
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // clipboard unavailable; the user can select the value and copy it
      })
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
      <span className="qc-state-icon size-3.5" aria-hidden="true">
        <span className="qc-state-icon__glyph" data-visible={!copied}>
          <Copy className="h-3.5 w-3.5" />
        </span>
        <span className="qc-state-icon__glyph" data-visible={copied}>
          <Check className="h-3.5 w-3.5" />
        </span>
      </span>
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </Button>
  )
}
