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
import {
  credentialFieldsFor,
  credentialInputName,
  credentialPlaceholder,
} from "@/lib/credentials"
import { formatBalance } from "@/lib/format"
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
  const pools = connection.pools
  const credentialFields = credentialFieldsFor(
    connection.tool.credential_fields
  )

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={connection.status} />
          {editingName ? (
            <form
              action={(fd) =>
                startTransition(async () => {
                  await renameConnection(connection.id, String(fd.get("name")))
                  setEditingName(false)
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

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await refreshConnection(connection.id)
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
              const res = await updateKey(connection.id, fd)
              if (res.ok) setShowKeyForm(false)
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
                  await removeConnection(connection.id)
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
