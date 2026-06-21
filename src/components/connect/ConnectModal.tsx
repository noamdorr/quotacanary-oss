"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type ConnectResult, connectTool } from "@/lib/actions/connections"
import {
  credentialFieldsFor,
  credentialInputName,
  credentialPlaceholder,
} from "@/lib/credentials"
import type { Tool } from "@/lib/types"
import { ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"

type Props = {
  tool: Tool
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectModal({ tool, open, onOpenChange }: Props) {
  const router = useRouter()
  const credentialFields = credentialFieldsFor(tool.credential_fields)
  const [state, formAction, pending] = useActionState(
    async (_prev: ConnectResult | null, formData: FormData) => {
      const result = await connectTool(formData)
      if (result.ok) {
        onOpenChange(false)
        router.push(
          `/dashboard?connected=${encodeURIComponent(result.connectionId)}`
        )
        router.refresh()
      }
      return result
    },
    null
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2 text-lg font-bold">
          Connect {tool.name}
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          QuotaCanary reads your balance. It can&apos;t spend credits or change
          your account.
        </p>

        {tool.key_instructions && (
          <div className="rounded-md border border-border/60 bg-secondary/40 p-3 text-sm">
            <p className="font-medium text-foreground">Where to find it</p>
            <p className="text-muted-foreground">{tool.key_instructions}</p>
            {tool.api_docs_url && (
              <a
                href={tool.api_docs_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                <span className="flex items-center gap-1">
                  API docs <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </a>
            )}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="toolId" value={tool.id} />
          {credentialFields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={credentialInputName(field)}>{field.label}</Label>
              <Input
                id={credentialInputName(field)}
                name={credentialInputName(field)}
                type={field.type}
                required
                autoComplete="off"
                placeholder={credentialPlaceholder(tool.name, field)}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="name">Connection name</Label>
            <Input id="name" name="name" defaultValue={tool.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma-separated, optional)</Label>
            <Input id="tags" name="tags" placeholder="acme, client-work" />
          </div>
          {tool.pools && tool.pools.length > 1 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                Track which balances?
              </legend>
              {tool.pools.map((p) => (
                <label
                  key={p.credit_type}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="watchedCreditTypes"
                    value={p.credit_type}
                    defaultChecked
                    className="h-4 w-4 rounded border-border"
                  />
                  {p.label}
                </label>
              ))}
            </fieldset>
          )}
          {state && !state.ok && (
            <p role="alert" className="text-sm text-[var(--dry)]">
              {state.error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Checking balance…" : "Connect & check balance"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your credentials are encrypted with AES-256.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
