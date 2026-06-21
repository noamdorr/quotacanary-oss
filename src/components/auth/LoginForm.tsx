"use client"

import { login } from "@/app/(auth)/login/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { ResetPasswordForm } from "./ResetPasswordForm"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  )
}

export function LoginForm() {
  const [showReset, setShowReset] = useState(false)
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await login(formData)
      return result ?? null
    },
    null
  )

  if (showReset) {
    return <ResetPasswordForm onBack={() => setShowReset(false)} />
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-[var(--dry)]">
          {state.error}
        </p>
      )}
      <SubmitButton />
      <button
        type="button"
        onClick={() => setShowReset(true)}
        className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
      >
        Forgot password?
      </button>
    </form>
  )
}
