import { sendEmail } from "@/lib/email/client"
import { renderWelcomeEmail } from "@/lib/email/render/welcome"
import { createRouteClient } from "@/lib/supabase/server"
import type { EmailOtpType, User } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

// Relative Location → the browser resolves it against the PUBLIC request URL.
// Behind Railway/Cloudflare, request.url/request.nextUrl is the internal origin
// (e.g. http://localhost:8080), so it must NOT be used to build redirects.
function redirectTo(path: string) {
  return new NextResponse(null, { status: 307, headers: { Location: path } })
}

// Fire-and-forget, same as QUO-72's original send from the now-deleted
// signup() action: a Postmark failure only logs, it never blocks the
// redirect. mark_user_welcomed() (058) is the atomic `WHERE welcomed_at IS
// NULL` guard - magic link can't tell signup from login up front (Supabase
// hides that to prevent email enumeration), so this is the only point a
// "first time" send can be decided, and it has to survive a re-clicked link
// or a racing second confirm without double-send. Never awaited by callers,
// so it swallows its own errors rather than rejecting.
async function sendWelcomeEmailIfNew(
  supabase: ReturnType<typeof createRouteClient>,
  user: User | null | undefined
) {
  try {
    if (!user?.email) return
    const { data: isFirstSend, error } =
      await supabase.rpc("mark_user_welcomed")
    if (error) {
      console.error("[welcome-email] mark_user_welcomed failed", error.message)
      return
    }
    if (!isFirstSend) return

    const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`
    const { subject, html, text } = renderWelcomeEmail({ dashboardUrl })
    const result = await sendEmail({
      to: user.email,
      subject,
      html,
      text,
      tag: "welcome",
    })
    if (!result.ok) console.error("[welcome-email] send failed", result.error)
  } catch (err) {
    console.error("[welcome-email] unexpected failure", err)
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  // Open-redirect guard: only ever redirect to a relative in-app path.
  // `//evil.com` is scheme-relative (treated as absolute by browsers), and
  // browsers normalize backslashes to slashes, so `/\evil.com` is just as bad.
  const nextParam = searchParams.get("next") ?? "/dashboard"
  const next =
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.startsWith("/\\")
      ? nextParam
      : "/dashboard"

  const success = redirectTo(next)
  const failure = redirectTo("/login?error=confirmation_failed")

  // Cookie writes are bound to the success response so the new session cookies
  // are attached to the redirect.
  const supabase = createRouteClient(request, success)

  // PKCE flow (the @supabase/ssr default): Supabase's /auth/v1/verify consumes
  // the emailed pkce_ token and redirects here with a `code` to exchange for a
  // session. This is what magic-link sign-in uses.
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      sendWelcomeEmailIfNew(supabase, data.user)
      return success
    }
  } else if (token_hash && type) {
    // OTP flow: only if the email template is built with {{ .TokenHash }}.
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      sendWelcomeEmailIfNew(supabase, data.user)
      return success
    }
  }

  return failure
}
