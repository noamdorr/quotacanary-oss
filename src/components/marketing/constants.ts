// Public origin of the app surface. NEXT_PUBLIC_* is inlined at build time;
// fall back to the prod app origin so a missing var never yields a broken
// relative link.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://app.quotacanary.com"

export const APP_LOGIN_URL = `${APP_URL}/login`
export const APP_SIGNUP_URL = `${APP_LOGIN_URL}?tab=signup`

// Public origin of the marketing surface (where /docs lives). App→docs links
// use this so they land on the canonical marketing origin, not a duplicate
// of /docs served on the app host.
export const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://quotacanary.com"
