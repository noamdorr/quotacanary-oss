"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type ActionResult,
  createAlertDestination,
  deleteAlertDestination,
  toggleAlertDestination,
} from "@/lib/actions/alerts"
import { runClientAction } from "@/lib/client-action"
import type { AlertDestination } from "@/lib/types"
import { Power, PowerOff, Trash2 } from "lucide-react"
import { useActionState, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Add destination"}
    </Button>
  )
}

export function AlertDestinations({
  destinations,
}: {
  destinations: AlertDestination[]
}) {
  const [state, formAction] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) =>
      createAlertDestination(formData),
    null
  )
  const [pending, startTransition] = useTransition()
  const [rowError, setRowError] = useState<{
    id: string
    message: string
  } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<AlertDestination | null>(
    null
  )

  function toggle(destination: AlertDestination) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", destination.id)
      formData.set("enabled", String(!destination.is_enabled))
      const res = await runClientAction(() => toggleAlertDestination(formData))
      setRowError(res.ok ? null : { id: destination.id, message: res.error })
    })
  }

  function remove(destination: AlertDestination) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", destination.id)
      const res = await runClientAction(() => deleteAlertDestination(formData))
      setConfirmRemove(null)
      setRowError(res.ok ? null : { id: destination.id, message: res.error })
    })
  }

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="grid gap-3 rounded-lg border border-border/60 bg-card p-4 md:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <div className="space-y-2">
          <Label htmlFor="destination-name">Name</Label>
          <Input
            id="destination-name"
            name="name"
            placeholder="Ops webhook"
            maxLength={80}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="destination-kind">Type</Label>
          <select
            id="destination-kind"
            name="kind"
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            defaultValue="webhook"
          >
            <option value="webhook">Generic webhook</option>
            <option value="slack_webhook">Slack incoming webhook</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="destination-level">Send on</Label>
          <select
            id="destination-level"
            name="minLevel"
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            defaultValue="low"
          >
            <option value="low">Low + critical</option>
            <option value="critical">Critical only</option>
          </select>
        </div>
        <div className="space-y-2 md:col-span-2 lg:col-span-4">
          <Label htmlFor="destination-url">Webhook URL</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="destination-url"
              name="url"
              type="url"
              placeholder="https://hooks.example.com/..."
              required
            />
            <SubmitButton />
          </div>
        </div>
        {state?.ok === false && (
          <p
            role="alert"
            className="text-sm text-[var(--dry)] md:col-span-2 lg:col-span-4"
          >
            {state.error}
          </p>
        )}
      </form>

      <div className="space-y-3">
        {destinations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No webhook destinations yet.
          </p>
        ) : (
          destinations.map((destination) => (
            <div
              key={destination.id}
              className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium">{destination.name}</p>
                <p className="text-xs text-muted-foreground">
                  {destination.kind === "slack_webhook"
                    ? "Slack incoming webhook"
                    : "Generic webhook"}{" "}
                  -{" "}
                  {destination.min_level === "critical"
                    ? "critical only"
                    : "low + critical"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {destination.url_hint}
                </p>
                {destination.last_error && (
                  <p className="text-xs text-[var(--dry)]">
                    Last error: {destination.last_error}
                  </p>
                )}
                {rowError?.id === destination.id && (
                  <p role="alert" className="text-xs text-[var(--dry)]">
                    {rowError.message}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="icon-sm"
                  variant={destination.is_enabled ? "secondary" : "outline"}
                  aria-label={destination.is_enabled ? "Disable" : "Enable"}
                  title={destination.is_enabled ? "Disable" : "Enable"}
                  disabled={pending}
                  onClick={() => toggle(destination)}
                >
                  {destination.is_enabled ? <PowerOff /> : <Power />}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="destructive"
                  aria-label="Remove"
                  title="Remove"
                  disabled={pending}
                  onClick={() => setConfirmRemove(destination)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog
        open={confirmRemove !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle>Remove {confirmRemove?.name}?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This stops sending alerts to it. This can't be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirmRemove(null)}
            >
              Keep
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (confirmRemove) remove(confirmRemove)
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
