"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type ActionResult, submitFeedback } from "@/lib/actions/feedback"
import { cn } from "@/lib/utils"
import { Check, MessageSquare } from "lucide-react"
import { usePathname } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

type Category = "bug" | "feedback" | "tool"

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "Something's broken" },
  { value: "feedback", label: "Idea or gripe" },
  { value: "tool", label: "Tool request" },
]

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const pathname = usePathname()
  const [category, setCategory] = useState<Category>("bug")
  const [submitted, setSubmitted] = useState(false)

  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      // Read at submit time, not render time: rendering navigator.userAgent
      // into a hidden input mismatches the server's empty string and trips
      // hydration.
      formData.set("userAgent", navigator.userAgent)
      const result = await submitFeedback(null, formData)
      if (result.ok) setSubmitted(true)
      return result
    },
    null
  )

  // Reset on reopen so a returning user sees the form, not a stale thank-you.
  useEffect(() => {
    if (open) {
      setSubmitted(false)
      setCategory("bug")
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-lg font-bold">
          {submitted ? "Thanks - that's in" : "Send feedback"}
        </DialogTitle>
        {submitted ? (
          <div className="space-y-3 py-2">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--healthy-bg)] text-[var(--healthy-text)]">
              <Check className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">
              It goes straight to the person who builds this. If it needs a
              reply, you'll get one at your account email.
            </p>
            <Button
              type="button"
              variant="ghost"
              className="h-10 w-full"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="pagePath" value={pathname} />

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">
                What's this about?
              </legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      category === option.value
                        ? "border-foreground bg-secondary text-foreground"
                        : "border-input text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option.value}
                      checked={category === option.value}
                      onChange={() => setCategory(option.value)}
                      className="sr-only"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {category === "tool" && (
              <div className="space-y-2">
                <Label htmlFor="feedback-tool">Tool name</Label>
                <Input id="feedback-tool" name="toolName" required />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="feedback-message">
                {category === "bug" ? "What happened?" : "Tell us more"}
              </Label>
              <textarea
                id="feedback-message"
                name="message"
                required
                rows={5}
                maxLength={4000}
                placeholder={
                  category === "bug"
                    ? "What you did, what you expected, what you got."
                    : "Anything confusing, missing, or annoying."
                }
                className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              We attach the page you're on and your app version. Never your API
              keys or balances.
            </p>

            {state && !state.ok && (
              <p role="alert" className="text-sm text-[var(--dry)]">
                {state.error}
              </p>
            )}

            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending ? "Sending…" : "Send"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Persistent entry point: lives in the dashboard header, so it is on every
// signed-in screen at both breakpoints (the mobile tab bar has no free slot).
export function FeedbackTrigger() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground"
      >
        <MessageSquare className="h-4 w-4 md:mr-1.5" aria-hidden />
        <span className="sr-only md:not-sr-only">Feedback</span>
      </Button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
