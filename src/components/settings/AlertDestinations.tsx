"use client"

import { CopyButton } from "@/components/settings/CopyButton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  type ActionResult,
  createAlertDestination,
  deleteAlertDestination,
  rotateAlertDestinationSecret,
  sendTestAlertDestination,
  toggleAlertDestination,
} from "@/lib/actions/alerts"
import { runClientAction } from "@/lib/client-action"
import { FUNNEL_EVENTS, trackPlausibleEvent } from "@/lib/plausible-events"
import type { AlertDestination } from "@/lib/types"
import { Power, PowerOff, Send, Trash2 } from "lucide-react"
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

// The secret is returned by exactly one server-action call and never again, so
// this panel is the only place it is ever readable.
function SecretReveal({ secret }: { secret: string }) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--brand)]/40 bg-[var(--brand)]/5 p-4">
      <p className="font-semibold text-foreground text-sm">
        Copy this signing secret now - you won&apos;t see it again
      </p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          {secret}
        </code>
        <CopyButton value={secret} />
      </div>
      <p className="text-muted-foreground text-xs">
        Use it to verify the{" "}
        <code className="font-mono">quotacanary-signature</code> header on every
        delivery. See the webhook docs for how.
      </p>
    </div>
  )
}

// Delivery health is only useful at minute resolution: "failed on 9 Aug" does
// not tell you whether the endpoint is broken now or was broken last week.
//
// suppressHydrationWarning because that is the point of the element: the server
// renders this in the host's timezone and the browser re-renders it in the
// viewer's, and those legitimately differ. Without it every non-UTC visitor
// gets a hydration error on the settings page.
function Moment({ value }: { value: string | null }) {
  if (!value) return <>none yet</>
  return (
    <time dateTime={value} suppressHydrationWarning>
      {new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  )
}

export function AlertDestinations({
  destinations,
}: {
  destinations: AlertDestination[]
}) {
  const [state, formAction] = useActionState(
    async (_prev: ActionResult | null, formData: FormData) => {
      const result = await createAlertDestination(formData)
      if (result.ok)
        trackPlausibleEvent(FUNNEL_EVENTS.ALERT_DESTINATION_CREATED)
      return result
    },
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
  const [rotatedSecret, setRotatedSecret] = useState<{
    id: string
    secret: string
  } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    id: string
    ok: boolean
    message: string
  } | null>(null)

  function rotateSecret(destination: AlertDestination) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", destination.id)
      const res = await runClientAction(() =>
        rotateAlertDestinationSecret(formData)
      )
      if (res.ok && res.signingSecret) {
        setRotatedSecret({ id: destination.id, secret: res.signingSecret })
        setRowError(null)
      } else if (!res.ok) {
        setRotatedSecret(null)
        setRowError({ id: destination.id, message: res.error })
      }
    })
  }

  function sendTest(destination: AlertDestination) {
    setTestResult(null)
    setTestingId(destination.id)
    startTransition(async () => {
      const formData = new FormData()
      formData.set("id", destination.id)
      const res = await runClientAction(() =>
        sendTestAlertDestination(formData)
      )
      setTestingId(null)
      setTestResult({
        id: destination.id,
        ok: res.ok,
        message: res.ok ? "Test alert delivered." : res.error,
      })
    })
  }

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

      {state?.ok === true && state.signingSecret && (
        <SecretReveal secret={state.signingSecret} />
      )}

      <div className="space-y-3">
        {destinations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No webhook destinations yet.
          </p>
        ) : (
          destinations.map((destination) => (
            <div
              key={destination.id}
              className="space-y-3 rounded-lg border border-border/60 bg-card p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                  <p className="text-xs text-muted-foreground">
                    Last attempt: <Moment value={destination.last_attempt_at} />{" "}
                    - last success: <Moment value={destination.last_sent_at} />
                  </p>
                  {destination.kind === "webhook" && (
                    <p className="text-xs text-muted-foreground">
                      {destination.signing_secret_set_at
                        ? `Signed - secret set ${new Date(destination.signing_secret_set_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`
                        : "Unsigned - generate a secret to verify deliveries"}
                    </p>
                  )}
                  {destination.last_error && (
                    <p className="text-xs text-[var(--dry)]">
                      Last error: {destination.last_error}
                    </p>
                  )}
                  {testingId === destination.id && (
                    <p className="text-xs text-muted-foreground">
                      Sending test…
                    </p>
                  )}
                  {testingId !== destination.id &&
                    testResult?.id === destination.id && (
                      <p
                        role={testResult.ok ? "status" : "alert"}
                        className={
                          testResult.ok
                            ? "text-xs text-muted-foreground"
                            : "text-xs text-[var(--dry)]"
                        }
                      >
                        {testResult.message}
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
                    variant="outline"
                    aria-label="Send test"
                    title="Send a test alert to this destination"
                    disabled={pending}
                    onClick={() => sendTest(destination)}
                  >
                    <Send />
                  </Button>
                  {destination.kind === "webhook" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => rotateSecret(destination)}
                    >
                      {destination.signing_secret_set_at
                        ? "Rotate secret"
                        : "Generate secret"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={destination.is_enabled ? "secondary" : "outline"}
                    aria-label={destination.is_enabled ? "Disable" : "Enable"}
                    title={destination.is_enabled ? "Disable" : "Enable"}
                    disabled={pending}
                    onClick={() => toggle(destination)}
                  >
                    <span className="qc-state-icon" aria-hidden="true">
                      <span
                        className="qc-state-icon__glyph"
                        data-visible={!destination.is_enabled}
                      >
                        <Power />
                      </span>
                      <span
                        className="qc-state-icon__glyph"
                        data-visible={destination.is_enabled}
                      >
                        <PowerOff />
                      </span>
                    </span>
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
              {rotatedSecret?.id === destination.id && (
                <SecretReveal secret={rotatedSecret.secret} />
              )}
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
