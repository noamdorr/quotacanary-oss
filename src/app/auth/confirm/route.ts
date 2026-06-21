import { createRouteClient } from "@/lib/supabase/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

// Relative Location → the browser resolves it against the PUBLIC request URL.
// Behind Railway/Cloudflare, request.url/request.nextUrl is the internal origin
// (e.g. http://localhost:8080), so it must NOT be used to build redirects.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  // Open-redirect guard: only ever redirect to a relative in-app path.
  // `//evil.com` is scheme-relative (treated as absolute by browsers).
  const nextParam = searchParams.get("next") ?? "/dashboard"
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard"

  const success = redirectTo(next)
  const failure = redirectTo("/login?error=confirmation_failed")

  // Cookie writes are bound to the success response so the new session cookies
  // are attached to the redirect.
  const supabase = createRouteClient(request, success)

  // PKCE flow (the @supabase/ssr default): Supabase's /auth/v1/verify consumes
  // the emailed pkce_ token and redirects here with a `code` to exchange for a
  // session. This is what password-recovery links use.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return success
  } else if (token_hash && type) {
    // OTP flow: only if the email template is built with {{ .TokenHash }}.
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return success
  }

  return failure
}
