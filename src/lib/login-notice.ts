// Copy for the /login ?error query param. Only allowlisted codes render
// their mapped copy; anything else falls back to a generic static line.
// Never decode or echo the raw param - a crafted value would render
// attacker text inside the trusted alert box, and decodeURIComponent("%")
// throws.

const ERROR_NOTICES: Record<string, string> = {
  confirmation_failed:
    "That link expired or was already used. Enter your email below for a new one.",
}

export function loginErrorNotice(error?: string): string | null {
  if (!error) return null
  return ERROR_NOTICES[error] ?? "Something went wrong. Please try again."
}
