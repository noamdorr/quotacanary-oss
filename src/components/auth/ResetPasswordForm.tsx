"use client"

import { resetPassword } from "@/app/(auth)/login/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  )
}

interface ResetPasswordFormProps {
  onBack: () => void
}

export function ResetPasswordForm({ onBack }: ResetPasswordFormProps) {
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await resetPassword(formData)
      return result ?? null
    },
    null
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter your email address and we'll send you a reset link.
      </p>
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-email">Email</Label>
          <Input
            id="reset-email"
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
      </form>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        Back to sign in
      </button>
    </div>
  )
}
