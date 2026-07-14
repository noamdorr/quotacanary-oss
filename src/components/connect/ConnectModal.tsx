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
import { ExternalLink, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState } from "react"

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
      <DialogContent className="qc-connect-modal max-w-lg gap-5">
        <div className="flex items-start gap-3">
          <div className="qc-connect-card__logo flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary text-lg font-bold">
            {tool.logo_url ? (
              <img
                src={tool.logo_url}
                alt=""
                className="h-8 w-8 object-contain"
              />
            ) : (
              tool.name.charAt(0)
            )}
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold">
              Connect {tool.name}
            </DialogTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Paste the key, get the balance, keep the spending privileges far
              away from us.
            </p>
          </div>
        </div>

        <div className="qc-connect-key-panel rounded-lg border border-border/60 p-3 text-sm">
          <div className="flex gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--canary-tint)] text-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="font-medium text-foreground">
                Read-only balance check
              </p>
              <p className="mt-1 text-muted-foreground">
                QuotaCanary reads balances only. Credentials are encrypted
                before storage.
              </p>
            </div>
          </div>
          {tool.key_instructions && (
            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="font-medium text-foreground">Where to find it</p>
              <p className="mt-1 text-muted-foreground">
                {tool.key_instructions}
              </p>
              {tool.api_docs_url && (
                <a
                  href={tool.api_docs_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-[var(--low-text)] hover:text-foreground hover:underline"
                >
                  API docs <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          )}
        </div>

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
            <fieldset className="space-y-2 rounded-lg border border-border/60 bg-secondary/30 p-3">
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
            {pending ? (
              <span className="qc-connect-listening">
                <span aria-hidden="true" className="qc-connect-listening-dot" />
                Listening for balance…
              </span>
            ) : (
              "Connect & check balance"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            AES-256 at rest. No write scopes, no funny business.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
