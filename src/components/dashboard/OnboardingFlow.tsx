"use client"

import { Canary } from "@/components/brand/Canary"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { completeOnboarding, connectTool } from "@/lib/actions/connections"
import { effectiveStatus } from "@/lib/balance-status"
import {
  type CredentialValues,
  appendCredentialValues,
  credentialFieldsFor,
  credentialInputName,
  credentialPlaceholder,
  credentialsComplete,
} from "@/lib/credentials"
import type { FeaturedTool } from "@/lib/featured-tools"
import { formatBalance } from "@/lib/format"
import { FUNNEL_EVENTS, trackPlausibleEvent } from "@/lib/plausible-events"
import { Check } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { FirstToolConfetti } from "./FirstToolConfetti"
import { StatusPill } from "./StatusPill"

type Step = "welcome" | "connect" | "success"

type Connected = {
  toolName: string
  logoUrl: string | null
  pools: { balance: number; label: string; unit: string }[]
  low: number | null
  critical: number | null
}

// The "where to find your key" note is the credential fields' help text, so it
// needs a stable id to hang every field's aria-describedby off.
const KEY_HELP_ID = "onboarding-key-help"

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "connect", label: "Connect a tool" },
  { key: "success", label: "You're set" },
]

function StepIndicator({ step }: { step: Step }) {
  const order: Step[] = ["welcome", "connect", "success"]
  const idx = order.indexOf(step)
  return (
    // An ordered list so assistive tech gets the count and the position, with
    // aria-current marking where the user is. The connector rules are pure
    // decoration and cost ~48px, so they sit out the narrow widths where the
    // three labels are the thing that has to fit.
    <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1">
      {STEP_LABELS.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === idx ? "step" : undefined}
          className="flex items-center gap-2"
        >
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              i < idx
                ? "bg-[var(--canary)] text-[var(--ink)]"
                : i === idx
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i < idx ? "✓" : i + 1}
          </span>
          <span className="text-xs text-muted-foreground">{s.label}</span>
          {i < STEP_LABELS.length - 1 && (
            <span
              aria-hidden="true"
              className="hidden h-px w-5 bg-border sm:block"
            />
          )}
        </li>
      ))}
    </ol>
  )
}

export function OnboardingFlow({
  featured,
  totalToolCount,
}: {
  featured: FeaturedTool[]
  totalToolCount: number
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("welcome")
  const [selected, setSelected] = useState<FeaturedTool | null>(null)
  // Which pools to watch for a multi-pool tool. Empty = watch all (also the
  // single-pool case, where no picker is shown).
  const [watched, setWatched] = useState<string[]>([])
  const [credentialValues, setCredentialValues] = useState<CredentialValues>({})
  // Credential fields the user has left, so a required-field error only shows
  // after they had a chance to fill it, never on a pristine form.
  const [touched, setTouched] = useState<string[]>([])
  // biome-ignore format: source contract requires this initializer verbatim
  const [createRequestId, setCreateRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState<Connected | null>(null)
  const [checkingBalance, setCheckingBalance] = useState(false)
  const [pending, startTransition] = useTransition()

  // Only never-onboarded users ever see this panel, so mounting it is the
  // closest client-side observable to "signup completed" (see FUNNEL_EVENTS).
  useEffect(() => {
    trackPlausibleEvent(FUNNEL_EVENTS.SIGNUP_COMPLETED)
  }, [])

  // Leave the flow: mark onboarding done, then reveal the dashboard. Used by
  // both "Skip for now" and "Go to my dashboard". On failure we surface the
  // error and stay put rather than silently bouncing.
  function finish() {
    startTransition(async () => {
      const res = await completeOnboarding()
      if (!res.ok) {
        setError(res.error)
        return
      }
      trackPlausibleEvent(FUNNEL_EVENTS.ONBOARDING_COMPLETED)
      router.refresh()
    })
  }

  function submit() {
    if (
      !selected ||
      !credentialsComplete(selected.credential_fields, credentialValues)
    )
      return
    const tool = selected
    setError(null)
    setCheckingBalance(true)
    startTransition(async () => {
      const fd = new FormData()
      fd.set("toolId", tool.id)
      appendCredentialValues(fd, tool.credential_fields, credentialValues)
      fd.set("name", tool.name)
      fd.set("createRequestId", createRequestId)
      for (const ct of watched) fd.append("watchedCreditTypes", ct)
      // Note: we do NOT mark onboarding complete here. Setting onboarded_at
      // revalidates /dashboard, which would swap this panel for the populated
      // dashboard and skip the success step. The flag is set when the user
      // leaves the flow (Go to my dashboard / Skip) instead.
      const res = await connectTool(fd)
      if (!res.ok) {
        setError(res.error)
        setCheckingBalance(false)
        return
      }
      trackPlausibleEvent(FUNNEL_EVENTS.CONNECTION_CREATED, { tool: tool.id })
      trackPlausibleEvent(FUNNEL_EVENTS.FIRST_BALANCE)
      setConnected({
        toolName: tool.name,
        logoUrl: tool.logo_url,
        pools: res.balances,
        low: tool.default_low_threshold,
        critical: tool.default_alert_threshold,
      })
      setCheckingBalance(false)
      setStep("success")
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-8">
      <StepIndicator step={step} />

      {error && (
        <p role="alert" className="mb-4 text-sm text-[var(--dry)]">
          {error}
        </p>
      )}

      {step === "welcome" && (
        <div className="relative">
          <div
            className="pointer-events-none absolute -top-3 right-0 hidden sm:block"
            aria-hidden="true"
          >
            <Canary mood="perched" size={76} />
          </div>
          <h2
            className="mb-2 text-2xl font-extrabold tracking-tight text-foreground"
            style={{ fontFamily: "var(--f-display)" }}
          >
            Welcome to QuotaCanary
          </h2>
          <p className="mb-6 max-w-xl text-sm text-muted-foreground">
            Keep an eye on the credit balances you connect, and get warned
            before any of them runs dry.
          </p>
          <ul className="mb-7 space-y-3">
            {[
              {
                t: "Connect a tool with API credentials",
                s: "Encrypted at rest and read-only. We only ever read your balance, never touch your account.",
              },
              {
                t: "See its balance instantly",
                s: "Watch how quickly it's drawing down over time.",
              },
              {
                t: "Get warned before a tool runs low",
                s: "Sensible alert thresholds, set for you.",
              },
            ].map((b) => (
              <li key={b.t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--healthy-bg)] text-[var(--healthy)]">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-foreground">
                  <span className="font-medium">{b.t}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {b.s}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button
              onClick={() => {
                trackPlausibleEvent(FUNNEL_EVENTS.ONBOARDING_STARTED)
                setStep("connect")
              }}
            >
              Get started
            </Button>
            <button
              type="button"
              onClick={finish}
              disabled={pending}
              className="rounded text-sm text-muted-foreground underline outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {step === "connect" && (
        <div>
          <h2 className="mb-1 text-xl font-bold text-foreground">
            Connect your first tool
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Pick a tool and paste its API credentials. We read the balance
            immediately and keep tracking it.
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {featured.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected?.id === t.id}
                onClick={() => {
                  setSelected(t)
                  setWatched(
                    t.pools && t.pools.length > 1
                      ? t.pools.map((p) => p.credit_type)
                      : []
                  )
                  setCredentialValues({})
                  setTouched([])
                  setCreateRequestId(crypto.randomUUID())
                  setError(null)
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 ${
                  selected?.id === t.id
                    ? "border-foreground bg-muted/60"
                    : "border-border hover:border-foreground/40"
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-secondary text-xs font-bold">
                  {t.logo_url ? (
                    <img
                      src={t.logo_url}
                      alt=""
                      className="h-4 w-4 object-contain"
                    />
                  ) : (
                    t.name.charAt(0)
                  )}
                </span>
                {t.name}
              </button>
            ))}
            <Link
              href="/connect"
              className="text-sm text-muted-foreground underline hover:text-foreground"
            >
              See all {totalToolCount} tools
            </Link>
          </div>

          {selected && (
            <div className="mb-4 max-w-md">
              {selected.key_instructions && (
                <p
                  id={KEY_HELP_ID}
                  className="mb-3 rounded-lg bg-[var(--low-bg)] px-3 py-2 text-xs text-[var(--low-text)]"
                >
                  {selected.key_instructions}
                </p>
              )}
              <div className="space-y-3">
                {credentialFieldsFor(selected.credential_fields).map(
                  (field) => {
                    const inputId = `onboarding-${credentialInputName(field)}`
                    const errorId = `${inputId}-error`
                    const missing =
                      touched.includes(field.name) &&
                      !credentialValues[field.name]?.trim()
                    const describedBy = [
                      missing ? errorId : null,
                      selected.key_instructions ? KEY_HELP_ID : null,
                    ].filter(Boolean)
                    return (
                      <div key={field.name} className="space-y-1.5">
                        <Label htmlFor={inputId}>{field.label}</Label>
                        <Input
                          id={inputId}
                          name={credentialInputName(field)}
                          type={field.type}
                          value={credentialValues[field.name] ?? ""}
                          onChange={(e) =>
                            setCredentialValues((values) => ({
                              ...values,
                              [field.name]: e.target.value,
                            }))
                          }
                          onBlur={() =>
                            setTouched((names) =>
                              names.includes(field.name)
                                ? names
                                : [...names, field.name]
                            )
                          }
                          placeholder={credentialPlaceholder(
                            selected.name,
                            field
                          )}
                          // An API key is a secret, not a login. Password
                          // managers must not offer the user's account
                          // password here or save this as one, and mobile
                          // keyboards must not capitalize or "correct" a
                          // pasted key.
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          aria-invalid={missing || undefined}
                          aria-describedby={
                            describedBy.length
                              ? describedBy.join(" ")
                              : undefined
                          }
                        />
                        {missing && (
                          <p
                            id={errorId}
                            role="alert"
                            className="text-xs text-[var(--dry)]"
                          >
                            {field.label} is required.
                          </p>
                        )}
                      </div>
                    )
                  }
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Read-only: we check your balance, never spend credits or touch
                your account. Keys are encrypted at rest. Use a scoped key if
                your tool offers one.{" "}
                <a
                  href="/security"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  How we handle your key
                </a>
              </p>
              {selected.pools && selected.pools.length > 1 && (
                <fieldset className="mt-3 space-y-2">
                  <legend className="text-sm font-medium text-foreground">
                    Track which balances?
                  </legend>
                  {selected.pools.map((p) => (
                    <label
                      key={p.credit_type}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={watched.includes(p.credit_type)}
                        onChange={() =>
                          setWatched((w) =>
                            w.includes(p.credit_type)
                              ? w.filter((x) => x !== p.credit_type)
                              : [...w, p.credit_type]
                          )
                        }
                        className="h-4 w-4 rounded border-border"
                      />
                      {p.label}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}

          {checkingBalance && selected && (
            <output
              className="qc-onboarding-listening mb-4 flex max-w-md items-center gap-3 rounded-xl border px-3 py-2 text-sm text-foreground"
              aria-live="polite"
            >
              <span
                className="qc-onboarding-listening__bird"
                aria-hidden="true"
              >
                <Canary mood="alert" size={38} />
              </span>
              <span>
                <span className="block font-medium">
                  Listening for {selected.name}'s first balance.
                </span>
                <span className="block text-xs text-muted-foreground">
                  Read-only stakeout. No credits touched.
                </span>
              </span>
            </output>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button
              onClick={submit}
              disabled={
                pending ||
                !selected ||
                !credentialsComplete(
                  selected.credential_fields,
                  credentialValues
                )
              }
            >
              {checkingBalance ? (
                <span className="qc-connect-listening">
                  <span
                    className="qc-connect-listening-dot"
                    aria-hidden="true"
                  />
                  Listening for balance…
                </span>
              ) : (
                "Connect & check balance"
              )}
            </Button>
            <button
              type="button"
              onClick={finish}
              disabled={pending}
              className="rounded text-sm text-muted-foreground underline outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {step === "success" && connected && (
        <div>
          <FirstToolConfetti />
          <span className="mb-3 block" aria-hidden="true">
            <Canary mood="singing" size={56} />
          </span>
          <h2 className="mb-1 text-xl font-bold text-foreground">
            You're monitoring {connected.toolName}
          </h2>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            We read the balance once and we'll keep it fresh. Connect more tools
            or jump into your dashboard.
          </p>

          <div className="mb-6 max-w-sm space-y-2">
            {connected.pools.map((p) => (
              <div
                key={p.label}
                className="flex items-center gap-3 rounded-xl border border-border p-4"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-xs font-bold">
                  {connected.logoUrl ? (
                    <img
                      src={connected.logoUrl}
                      alt=""
                      className="h-5 w-5 object-contain"
                    />
                  ) : (
                    connected.toolName.charAt(0)
                  )}
                </span>
                <div>
                  <div className="text-lg font-bold tabular-nums text-foreground">
                    {formatBalance(p.balance, p.unit)}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.label}</div>
                </div>
                <span className="ml-auto">
                  <StatusPill
                    status={effectiveStatus({
                      balance: p.balance,
                      low: connected.low,
                      critical: connected.critical,
                      connectionStatus: "active",
                    })}
                  />
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button disabled={pending} onClick={finish}>
              Go to my dashboard
            </Button>
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setWatched([])
                setCredentialValues({})
                setTouched([])
                setError(null)
                setStep("connect")
              }}
              className="rounded text-sm text-muted-foreground underline outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Connect another tool
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
