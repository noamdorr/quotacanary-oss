"use client"

import { signup } from "@/app/(auth)/login/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? "Signing up…" : "Sign up"}
    </Button>
  )
}

export function SignupForm() {
  const [clientError, setClientError] = useState<string | null>(null)
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await signup(formData)
      return result ?? null
    },
    null
  )

  function handleSubmit(formData: FormData) {
    setClientError(null)
    const password = formData.get("password") as string
    const confirm = formData.get("confirm_password") as string

    if (password.length < 8) {
      setClientError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirm) {
      setClientError("Passwords do not match.")
      return
    }
    formAction(formData)
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-confirm">Confirm password</Label>
        <Input
          id="signup-confirm"
          name="confirm_password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="new-password"
        />
      </div>
      {(clientError || state?.error) && (
        <p role="alert" className="text-sm text-[var(--dry)]">
          {clientError ?? state?.error}
        </p>
      )}
      <SubmitButton />
      <p className="text-center text-xs text-muted-foreground">
        By signing up you agree to the{" "}
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
  )
}
