"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type ActionResult, requestTool } from "@/lib/actions/connections"
import { Check } from "lucide-react"
import { useActionState, useEffect, useState } from "react"

export function RequestToolDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [submitted, setSubmitted] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      const result = await requestTool(formData)
      if (result.ok) setSubmitted(true)
      return result
    },
    null
  )

  // Reset the confirmation when the dialog reopens so a returning user sees the
  // form, not a stale "got it".
  useEffect(() => {
    if (open) setSubmitted(false)
  }, [open])

  // Let the confirmation land, then close on its own.
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => onOpenChange(false), 1500)
    return () => clearTimeout(t)
  }, [submitted, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-lg font-bold">Request a tool</DialogTitle>
        {submitted ? (
          <div className="py-2">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--healthy-bg)] text-[var(--healthy-text)]">
              <Check className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">
              Got it - we'll take a look.
            </p>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="toolName">Tool name</Label>
              <Input id="toolName" name="toolName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Input
                id="note"
                name="note"
                placeholder="What do you use it for?"
              />
            </div>
            {state && !state.ok && (
              <p role="alert" className="text-sm text-[var(--dry)]">
                {state.error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
