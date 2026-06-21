// Public origin of the app surface. NEXT_PUBLIC_* is inlined at build time;
// fall back to the prod app origin so a missing var never yields a broken
// relative link.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://app.quotacanary.com"

export const APP_LOGIN_URL = `${APP_URL}/login`
export const APP_SIGNUP_URL = `${APP_LOGIN_URL}?tab=signup`

// Public origin of the marketing surface (where /docs lives). The host split
// makes /docs unreachable on the app host, so app→docs links must use this.
export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://quotacanary.com"
