// Carries "I want to connect <tool>" from a directory CTA through sign-in.
//
// The tool id makes a round trip the app does not control end to end: query
// param -> hidden form field -> Supabase magic-link email -> /auth/confirm ->
// /connect. Only the shape is checked here. Existence is checked on /connect,
// against the catalog query that page already runs: `public.tools` is readable
// `to authenticated` only, so there is no catalog to check against at sign-in
// time, and reaching for the service-role client to get one would put an
// admin credential in an unauthenticated path (and return nothing under
// APP_ONLY, silently killing the feature for self-hosters).

// Catalog ids are bare lowercase slugs ('neverbounce', 'logo.dev'). Anything
// else is refused rather than escaped, because a value that reaches a URL is
// easier to reason about when it cannot contain URL syntax at all.
const TOOL_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/

export function sanitizeToolId(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  return TOOL_ID.test(raw) ? raw : null
}

export function connectIntentPath(toolId: string): string {
  return `/connect?tool=${toolId}`
}

// Where Supabase sends the magic link. /auth/confirm already reads `next` and
// refuses anything that is not a relative in-app path, so the tool id rides
// through as one encoded value rather than as a param of its own.
export function magicLinkRedirectUrl(
  siteUrl: string | undefined,
  rawToolId: unknown
): string {
  const confirm = `${(siteUrl ?? "").replace(/\/$/, "")}/auth/confirm`
  const toolId = sanitizeToolId(rawToolId)
  if (!toolId) return confirm
  return `${confirm}?next=${encodeURIComponent(connectIntentPath(toolId))}`
}
