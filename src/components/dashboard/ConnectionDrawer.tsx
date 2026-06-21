"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  refreshConnection,
  removeConnection,
  setPoolThresholds,
  updateKey,
} from "@/lib/actions/connections"
import { burnRate } from "@/lib/burn-rate"
import { runClientAction } from "@/lib/client-action"
import {
  type CredentialValues,
  credentialFieldsFor,
  credentialInputName,
  credentialPlaceholder,
  credentialsComplete,
} from "@/lib/credentials"
import { formatBalance } from "@/lib/format"
import { poolEta } from "@/lib/pool-eta"
import type { PoolRow } from "@/lib/pool-rows"
import { resolvePoolThresholds, thresholdOrderError } from "@/lib/thresholds"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Check, ExternalLink, KeyRound, Trash2, X } from "lucide-react"
import { useState, useTransition } from "react"
import { Sparkline } from "./Sparkline"

// Parent keys this by pool-row, so it remounts (resetting inputs) per pool.
export function ConnectionDrawer({
  row,
  onClose,
}: {
  row: PoolRow | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [credentialValues, setCredentialValues] = useState<CredentialValues>({})
  const [keySaved, setKeySaved] = useState(false)
  const initial = row
    ? resolvePoolThresholds(row.connection, row.pool?.creditType ?? "")
    : { low: null, critical: null }
  const [lowValue, setLow] = useState(
    initial.low != null ? String(initial.low) : ""
  )
  const [critValue, setCritical] = useState(
    initial.critical != null ? String(initial.critical) : ""
  )

  if (!row) return null
  const { connection: c, pool } = row
  const credentialFields = credentialFieldsFor(c.tool.credential_fields)
  const balanceText = pool
    ? pool.balanceLimit != null
      ? `${formatBalance(pool.balance, pool.unit)} / ${formatBalance(pool.balanceLimit, pool.unit)}`
      : formatBalance(pool.balance, pool.unit)
    : "-"
  const eta = pool ? poolEta(pool) : null
  const burn = pool ? burnRate(pool.history) : null

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/20 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup className="fixed right-0 top-0 z-50 h-full w-[360px] max-w-[90vw] overflow-y-auto border-l border-border bg-background p-6 shadow-2xl outline-none transition-transform data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-sm font-bold">
              {c.tool.logo_url ? (
                <img
                  src={c.tool.logo_url}
                  alt=""
                  className="h-5 w-5 object-contain"
                />
              ) : (
                c.tool.name.charAt(0)
              )}
            </span>
            <DialogPrimitive.Title className="text-lg font-bold text-foreground">
              {c.name}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            {pool?.label ?? "No reading yet"}
          </p>

          {c.last_error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-[var(--dry)]/30 bg-[var(--dry)]/5 px-3 py-2 text-xs text-[var(--dry)]"
            >
              Last refresh failed: {c.last_error}
            </div>
          )}

          <p className="text-3xl font-extrabold tabular-nums text-foreground">
            {balanceText}
          </p>

          <Sparkline
            values={(pool?.history ?? []).map((h) => h.balance)}
            tone="neutral"
            className="my-4 h-16"
          />

          {eta && (
            <div className="mb-4">
              <p className="font-mono text-sm font-semibold text-foreground">
                {eta.short}
              </p>
              <p className="text-xs text-muted-foreground">{eta.long}</p>
              {burn && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Burning ~{Math.round(burn.perDay).toLocaleString()}/day
                </p>
              )}
            </div>
          )}

          <p className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Thresholds
          </p>
          <label className="mb-2 flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Low warning at</span>
            <input
              value={lowValue}
              onChange={(e) => {
                setLow(e.target.value)
                setSaved(false)
                setError(null)
              }}
              inputMode="numeric"
              className="w-24 rounded-md border border-border px-2 py-1.5 text-right tabular-nums"
            />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Critical at</span>
            <input
              value={critValue}
              onChange={(e) => {
                setCritical(e.target.value)
                setSaved(false)
                setError(null)
              }}
              inputMode="numeric"
              className="w-24 rounded-md border border-border px-2 py-1.5 text-right tabular-nums"
            />
          </label>

          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending || !pool}
              onClick={() =>
                startTransition(async () => {
                  if (!pool) return
                  const low = lowValue ? Number(lowValue) : null
                  const critical = critValue ? Number(critValue) : null
                  const orderError = thresholdOrderError(low, critical)
                  if (orderError) {
                    setError(orderError)
                    return
                  }
                  setError(null)
                  const res = await runClientAction(() =>
                    setPoolThresholds(c.id, pool.creditType, low, critical)
                  )
                  if (res.ok) setSaved(true)
                  else setError(res.error)
                })
              }
            >
              {saved ? (
                <span className="flex items-center justify-center gap-1">
                  <Check className="h-4 w-4" /> Saved
                </span>
              ) : (
                "Save thresholds"
              )}
            </Button>
            <Button
              className="flex-1"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await runClientAction(() =>
                    refreshConnection(c.id)
                  )
                  if (res.ok) setError(null)
                  else setError(res.error)
                })
              }
            >
              {pending ? "Refreshing…" : "Refresh now"}
            </Button>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-xs text-[var(--dry)]">
              {error}
            </p>
          )}

          {c.tool.topup_url && (
            <a
              href={c.tool.topup_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-lg border border-border py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
            >
              <span className="flex items-center justify-center gap-1">
                Get more <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </a>
          )}

          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Connection
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={pending}
                onClick={() => {
                  setShowKeyForm((show) => !show)
                  setConfirmRemove(false)
                  setError(null)
                  setKeySaved(false)
                }}
              >
                <KeyRound className="h-4 w-4" />
                Update key
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="flex-1"
                disabled={pending}
                onClick={() => {
                  setConfirmRemove(true)
                  setShowKeyForm(false)
                  setError(null)
                  setKeySaved(false)
                }}
              >
                <Trash2 className="h-4 w-4" />
                Remove connection
              </Button>
            </div>

            {keySaved && (
              <p className="mt-2 text-xs text-[var(--healthy-text)]">
                Key updated.
              </p>
            )}

            {showKeyForm && (
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const formData = new FormData(event.currentTarget)
                  startTransition(async () => {
                    if (
                      !credentialsComplete(
                        c.tool.credential_fields,
                        credentialValues
                      )
                    ) {
                      setError("New credentials are required.")
                      return
                    }
                    const res = await runClientAction(() =>
                      updateKey(c.id, formData)
                    )
                    if (res.ok) {
                      setCredentialValues({})
                      setShowKeyForm(false)
                      setKeySaved(true)
                      setError(null)
                    } else {
                      setError(res.error)
                    }
                  })
                }}
              >
                {credentialFields.map((field) => (
                  <Input
                    key={field.name}
                    name={credentialInputName(field)}
                    value={credentialValues[field.name] ?? ""}
                    onChange={(event) => {
                      setCredentialValues((values) => ({
                        ...values,
                        [field.name]: event.target.value,
                      }))
                      setError(null)
                      setKeySaved(false)
                    }}
                    type={field.type}
                    placeholder={credentialPlaceholder(c.tool.name, field)}
                    autoComplete="off"
                    disabled={pending}
                  />
                ))}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Checking credentials..." : "Save new credentials"}
                </Button>
              </form>
            )}

            {confirmRemove && (
              <div className="mt-3 rounded-lg border border-[var(--dry)]/30 bg-[var(--dry)]/5 p-3">
                <p className="text-sm font-semibold text-foreground">
                  Remove {c.name}?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This stops tracking it and deletes its balance history. This
                  can't be undone.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setConfirmRemove(false)}
                  >
                    Keep
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await runClientAction(() =>
                          removeConnection(c.id)
                        )
                        if (res.ok) onClose()
                        else setError(res.error)
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
