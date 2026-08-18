"use client"

import { sendMagicLink } from "@/app/(auth)/login/actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FUNNEL_EVENTS, trackPlausibleEvent } from "@/lib/plausible-events"
import Link from "next/link"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? "Sending…" : "Send magic link"}
    </Button>
  )
}

export function MagicLinkForm({ toolId }: { toolId?: string | null }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const email = String(formData.get("email"))
      const result = await sendMagicLink(formData)
      if (result?.error) return { error: result.error }
      trackPlausibleEvent(FUNNEL_EVENTS.SIGNUP_STARTED)
      setSentTo(email)
      return null
    },
    null
  )

  return (
    <Card className="w-full border-border bg-card shadow-sm">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="leading-none">
          <Link
            href="/"
            className="qc-nav-logo w-fit rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="QuotaCanary"
          >
            <img
              src="/logo.png"
              alt="QuotaCanary"
              width="122"
              height="27"
              style={{ width: 122, height: 27 }}
            />
          </Link>
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {sentTo ? "Check your inbox" : "Welcome back"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sentTo ? (
          <p className="text-sm text-muted-foreground">
            A sign-in link is on its way to <strong>{sentTo}</strong>.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            {/* Which tool the user came here to connect, so the sign-in email
                can land them on it. Absent unless a directory CTA set it. */}
            {toolId && <input type="hidden" name="tool" value={toolId} />}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            {state?.error && (
              <p role="alert" className="text-sm text-[var(--dry)]">
                {state.error}
              </p>
            )}
            <SubmitButton />
            <p className="text-center text-xs text-muted-foreground">
              By continuing you agree to the{" "}
              <a href="/terms" className="underline hover:text-foreground">
                terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline hover:text-foreground">
                privacy policy
              </a>
              .
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
