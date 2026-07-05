// Copy for the /login ?error and ?message query params. Only allowlisted
// codes render their mapped copy; anything else is either a generic static
// line (errors) or nothing (messages). Never decode or echo the raw param -
// a crafted value would render attacker text inside the trusted alert box,
// and decodeURIComponent("%") throws.

const ERROR_NOTICES: Record<string, string> = {
  confirmation_failed:
    'Email confirmation failed. The link may have expired. Use "Forgot password?" below to send yourself a fresh one.',
}

const MESSAGE_NOTICES: Record<string, string> = {
  check_email: "Check your email for a password reset link.",
}

export function loginErrorNotice(error?: string): string | null {
  if (!error) return null
  return ERROR_NOTICES[error] ?? "Something went wrong. Please try again."
}

export function loginMessageNotice(message?: string): string | null {
  if (!message) return null
  return MESSAGE_NOTICES[message] ?? null
}
