"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type ActionResult,
  createApiToken,
  revokeApiToken,
} from "@/lib/actions/api-tokens"
import { Check, Copy, KeyRound } from "lucide-react"
import { useActionState, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"

type ApiToken = {
  id: string
  name: string
  token_hint: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

function CreateSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create token"}
    </Button>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // clipboard unavailable; the user can select the token and copy manually
      })
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy
        </>
      )}
    </Button>
  )
}

function RevokeButton({ id, name }: { id: string; name: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [state, formAction] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) =>
      revokeApiToken(_prev, formData),
    null
  )

  useEffect(() => {
    if (state?.ok === true) setConfirmOpen(false)
  }, [state])

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => setConfirmOpen(true)}
      >
        Revoke
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Revoke &ldquo;{name}&rdquo;?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Any script or integration using this token will stop working
            immediately. This can&apos;t be undone.
          </p>
          {state?.ok === false && (
            <p role="alert" className="text-sm text-[var(--dry)]">
              {state.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
            >
              Keep
            </Button>
            <form action={formAction}>
              <input type="hidden" name="id" value={id} />
              <RevokeConfirmButton />
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function RevokeConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="destructive" disabled={pending}>
      {pending ? "Revoking..." : "Revoke"}
    </Button>
  )
}

export function ApiTokens({ tokens }: { tokens: ApiToken[] }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) =>
      createApiToken(_prev, formData),
    null
  )

  const activeTokens = tokens.filter((t) => !t.revoked_at)

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form action={formAction} className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="token-name">Token name</Label>
            <Input
              id="token-name"
              name="name"
              placeholder="My MCP client"
              maxLength={80}
              disabled={isPending}
            />
          </div>
          <CreateSubmitButton />
        </div>
        {state?.ok === false && (
          <p role="alert" className="text-sm text-[var(--dry)]">
            {state.error}
          </p>
        )}
      </form>

      {/* One-time reveal */}
      {state?.ok === true && state.secret && (
        <div className="rounded-lg border border-[var(--brand)]/40 bg-[var(--brand)]/5 p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Copy this token now - you won&apos;t see it again
          </p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">
              {state.secret}
            </code>
            <CopyButton value={state.secret} />
          </div>
          <p className="text-xs text-muted-foreground">
            Treat it like a password. It leaves this page once you navigate
            away.
          </p>
        </div>
      )}

      {/* Token list */}
      <div className="space-y-3">
        {activeTokens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
            <KeyRound
              className="h-6 w-6 text-muted-foreground/50"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              No active tokens yet.
            </p>
          </div>
        ) : (
          activeTokens.map((token) => (
            <div
              key={token.id}
              className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{token.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  qc_live_...{token.token_hint}
                </p>
                <p className="text-xs text-muted-foreground">
                  Created{" "}
                  {new Date(token.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  -{" "}
                  {token.last_used_at
                    ? `last used ${new Date(token.last_used_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
                    : "never used"}
                </p>
              </div>
              <RevokeButton id={token.id} name={token.name} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
