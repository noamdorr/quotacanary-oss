"use client"

import { StatusDot } from "@/components/dashboard/StatusDot"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  refreshConnection,
  removeConnection,
  renameConnection,
  updateKey,
} from "@/lib/actions/connections"
import { staleAdjustedStatus } from "@/lib/balance-status"
import { runClientAction } from "@/lib/client-action"
import {
  credentialFieldsFor,
  credentialInputName,
  credentialPlaceholder,
} from "@/lib/credentials"
import { formatBalance } from "@/lib/format"
import { newestRecordedAt } from "@/lib/pool-rows"
import type { ConnectionWithBalance } from "@/lib/types"
import { Pencil } from "lucide-react"
import { useState, useTransition } from "react"

export function ConnectionRow({
  connection,
}: {
  connection: ConnectionWithBalance
}) {
  const [pending, startTransition] = useTransition()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(connection.name)
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pools = connection.pools
  const credentialFields = credentialFieldsFor(
    connection.tool.credential_fields
  )
  // Same aging the dashboard applies in toPoolRows: a silent connection must
  // read "stale" here too, not keep its last "Active" dot.
  const status = staleAdjustedStatus({
    status: connection.status,
    newestRecordedAt: newestRecordedAt(connection),
  })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          {editingName ? (
            <form
              action={(fd) =>
                startTransition(async () => {
                  const nextName = String(fd.get("name"))
                  const res = await runClientAction(() =>
                    renameConnection(connection.id, nextName)
                  )
                  if (res.ok) {
                    setName(nextName.trim())
                    setEditingName(false)
                    setError(null)
                  } else {
                    setError(res.error)
                  }
                })
              }
              className="flex items-center gap-2"
            >
              <Input name="name" defaultValue={name} className="h-7 w-48" />
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="font-medium"
              onClick={() => setEditingName(true)}
            >
              {name} <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="text-right">
          {pools.length ? (
            pools.map((p) => (
              <div key={p.creditType} className="text-sm">
                <span className="text-muted-foreground">{p.label}: </span>
                <span className="font-bold tabular-nums">
                  {p.balanceLimit != null
                    ? `${formatBalance(p.balance, p.unit)} / ${formatBalance(p.balanceLimit, p.unit)}`
                    : formatBalance(p.balance, p.unit)}
                </span>
              </div>
            ))
          ) : (
            <span className="text-lg font-bold">-</span>
          )}
        </div>
      </div>

      {connection.last_error && (
        <p role="alert" className="text-xs text-[var(--dry)]">
          {connection.last_error}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-[var(--dry)]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await runClientAction(() =>
                refreshConnection(connection.id)
              )
              setError(res.ok ? null : res.error)
            })
          }
        >
          Refresh
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowKeyForm((s) => !s)}
        >
          Update key
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-[var(--dry)]"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        >
          Remove
        </Button>
      </div>

      {showKeyForm && (
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await runClientAction(() =>
                updateKey(connection.id, fd)
              )
              if (res.ok) {
                setShowKeyForm(false)
                setError(null)
              } else {
                setError(res.error)
              }
            })
          }
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        >
          {credentialFields.map((field) => (
            <Input
              key={field.name}
              name={credentialInputName(field)}
              type={field.type}
              placeholder={credentialPlaceholder(connection.tool.name, field)}
              className="h-8 min-w-0 flex-1 basis-40"
              required
            />
          ))}
          <Button type="submit" size="sm" disabled={pending}>
            Save credentials
          </Button>
        </form>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Remove {connection.name}?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This stops tracking it and deletes its balance history. This can't
            be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              Keep
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await runClientAction(() =>
                    removeConnection(connection.id)
                  )
                  setError(res.ok ? null : res.error)
                  setConfirmOpen(false)
                })
              }
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
