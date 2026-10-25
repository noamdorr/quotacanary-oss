import { Button } from "@/components/ui/button"

// Placeholder pending Noam's copy pick (QUO-210 stages the options).
export const MAGIC_LINK_RETRY_LABEL = "Wrong email or no link? Try again"

// One control covers both recoveries: it reopens the form with the address
// filled in, so a typo gets edited and a missing email gets re-sent. A resend
// inside Supabase's per-address cooldown comes back as the existing
// "Too many requests" error, so there is no countdown to keep here.
export function MagicLinkSent({
  email,
  onRetry,
}: {
  email: string
  onRetry: () => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A sign-in link is on its way to <strong>{email}</strong>.
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={onRetry}
      >
        {MAGIC_LINK_RETRY_LABEL}
      </Button>
    </div>
  )
}
