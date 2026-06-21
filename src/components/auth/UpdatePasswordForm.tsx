"use client"

import { updatePassword } from "@/app/(auth)/login/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full" disabled={pending}>
      {pending ? "Saving…" : "Set new password"}
    </Button>
  )
}

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const password = String(formData.get("password"))
      const confirm = String(formData.get("confirm"))
      if (password !== confirm) {
        return { error: "Passwords don't match." }
      }
      const result = await updatePassword(formData)
      return result ?? null
    },
    null
  )

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-[var(--dry)]">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  )
}
