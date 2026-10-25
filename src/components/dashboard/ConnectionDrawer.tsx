"use client"

import { CredentialFields } from "@/components/connect/CredentialFields"
import { Button } from "@/components/ui/button"
import { DialogClose } from "@/components/ui/dialog"
import {
  refreshConnection,
  removeConnection,
  setPoolThresholds,
  updateKey,
} from "@/lib/actions/connections"
import { runClientAction } from "@/lib/client-action"
import { type CredentialValues, credentialsComplete } from "@/lib/credentials"
import { formatBalance } from "@/lib/format"
import { assessPool } from "@/lib/pool-assessment"
import type { PoolRow } from "@/lib/pool-rows"
import { RUNWAY_HEADING } from "@/lib/runway-copy"
import { criticalFor, warnBelowError } from "@/lib/thresholds"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Check, ExternalLink, KeyRound, Trash2, X } from "lucide-react"
import { useState, useTransition } from "react"
import { Sparkline } from "./Sparkline"
import { StatusPill } from "./StatusPill"

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
  // Same assessment the row it opened from renders, so the two never disagree.
  const assessment = row ? assessPool(row) : null
  const initialLow = assessment?.thresholds.low ?? null
  const [warnBelowValue, setWarnBelow] = useState(
    initialLow != null ? String(initialLow) : ""
  )

  if (!row || !assessment) return null
  const { connection: c, pool } = row
  const balanceText = pool
    ? pool.balanceLimit != null
      ? `${formatBalance(pool.balance, pool.unit)} / ${formatBalance(pool.balanceLimit, pool.unit)}`
      : formatBalance(pool.balance, pool.unit)
    : "-"
  const { status, tone, eta, burn } = assessment
  // The red point shown is the one in force now, so an older override that is
  // not a third shows its real value. Saving re-derives it (a third of the
  // number, or the connection/tool default when the field is blank), so when
  // that would move it, say so before the user saves.
  const warnBelowText = warnBelowValue.trim()
  const warnBelow = warnBelowText ? Number(warnBelowText) : null
  const redPoint = assessment.thresholds.critical
  const redPointAfterSave =
    warnBelow == null
      ? assessment.inherited.critical
      : warnBelowError(warnBelow)
        ? null
        : criticalFor(warnBelow)
  // Same notation as the row and card ("red at $5.00"); a row with no reading
  // yet has no unit to format with.
  const showNumber = (n: number) =>
    pool ? formatBalance(n, pool.unit) : n.toLocaleString()
  const redPointLine =
    redPoint == null
      ? redPointAfterSave != null
        ? `Turns red at ${showNumber(redPointAfterSave)} once saved.`
        : null
      : redPointAfterSave == null
        ? `Turns red at ${showNumber(redPoint)}.`
        : redPointAfterSave !== redPoint
          ? `Turns red at ${showNumber(redPoint)}. Saving sets it to ${showNumber(redPointAfterSave)}.`
          : warnBelow != null
            ? `Turns red at ${showNumber(redPoint)}, a third of that.`
            : `Turns red at ${showNumber(redPoint)}.`

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
            <DialogClose
              className="ml-auto text-muted-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          <div className="mb-4 flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {pool?.label ?? "No reading yet"}
            </p>
            <StatusPill status={status} />
          </div>

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
            tone={tone}
            className="my-4 h-16"
          />

          {eta && (
            <div className="mb-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {RUNWAY_HEADING}
              </p>
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
          <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">Warn below</span>
            <input
              value={warnBelowValue}
              onChange={(e) => {
                setWarnBelow(e.target.value)
                setSaved(false)
                setError(null)
              }}
              inputMode="decimal"
              aria-describedby={
                redPointLine ? "warn-below-red-point" : undefined
              }
              className="w-24 rounded-md border border-border px-2 py-1.5 text-right tabular-nums"
            />
          </label>
          {redPointLine && (
            <p
              id="warn-below-red-point"
              className="mt-1.5 text-xs text-muted-foreground"
            >
              {redPointLine}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending || !pool}
              onClick={() =>
                startTransition(async () => {
                  if (!pool) return
                  const invalid = warnBelowError(warnBelow)
                  if (invalid) {
                    setError(invalid)
                    return
                  }
                  setError(null)
                  const res = await runClientAction(() =>
                    setPoolThresholds(c.id, pool.creditType, warnBelow)
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
                Top up <ExternalLink className="h-3.5 w-3.5" />
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
                <CredentialFields
                  toolName={c.tool.name}
                  fields={c.tool.credential_fields}
                  values={credentialValues}
                  onValuesChange={(update) => {
                    setCredentialValues(update)
                    setError(null)
                    setKeySaved(false)
                  }}
                  disabled={pending}
                />
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Checking credentials..." : "Save new credentials"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Encrypted at rest, read-only, and the old key is overwritten.{" "}
                  <a
                    href="/security"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    How we handle your key
                  </a>
                </p>
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
