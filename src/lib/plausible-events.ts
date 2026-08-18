type PlausibleWindow = Window & {
  plausible?: (
    eventName: string,
    options?: { props?: Record<string, string> }
  ) => void
}

// The acquisition-to-activation funnel, in order. One source of truth: add new
// events here, fire them via trackPlausibleEvent(FUNNEL_EVENTS.X) from the
// client component that observes the moment (server actions can't reach
// window.plausible, so the call sites are their client callers' success paths).
//
// Semantics worth knowing before reading the numbers:
// - SIGNUP_STARTED: a magic link was sent. Under passwordless auth this counts
//   returning sign-ins too; new-vs-returning is not knowable pre-auth.
// - SIGNUP_COMPLETED: the onboarding panel mounted. Only never-onboarded users
//   see it, so this approximates "first authenticated session". Re-fires if
//   they reload before finishing onboarding.
// - ONBOARDING_STARTED: clicked "Get started" on the welcome step.
// - ONBOARDING_COMPLETED: left the flow via "Go to my dashboard" or "Skip".
// - CONNECTION_CREATED: any successful connect (onboarding or /connect).
//   connectTool validates with one live balance read, so success implies a
//   working credential. Carries a `tool` prop (tool id, never a key).
// - FIRST_BALANCE: the onboarding success step rendered - the user's first
//   tool reporting a real balance. Users who skip onboarding and connect
//   later from /connect are counted under CONNECTION_CREATED only.
// - TOOL_REQUESTED: an unsupported-tool request was submitted. Fires alongside
//   the existing tool_requests DB write (which keeps the name/note); the event
//   itself carries no props because the tool name is free text.
// - ALERT_DESTINATION_CREATED: an email/webhook alert destination was saved.
export const FUNNEL_EVENTS = {
  SIGNUP_STARTED: "Signup Started",
  SIGNUP_COMPLETED: "Signup Completed",
  ONBOARDING_STARTED: "Onboarding Started",
  ONBOARDING_COMPLETED: "Onboarding Completed",
  CONNECTION_CREATED: "Connection Created",
  FIRST_BALANCE: "First Balance",
  TOOL_REQUESTED: "Tool Requested",
  ALERT_DESTINATION_CREATED: "Alert Destination Created",
} as const

export function trackPlausibleEvent(
  eventName: string,
  props?: Record<string, string>
) {
  if (typeof window === "undefined") {
    return
  }

  const plausible = (window as PlausibleWindow).plausible

  if (typeof plausible === "function") {
    if (props) {
      plausible(eventName, { props })
    } else {
      plausible(eventName)
    }
  }
}
