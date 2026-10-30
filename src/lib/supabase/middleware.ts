import { isProtectedAppPath } from "@/lib/host-routing"
import { type CookieOptions, createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

const APP_ROBOTS_HEADER = "noindex, nofollow, noarchive"

// The PUBLIC host/proto from proxy headers. Railway/Cloudflare terminate TLS
// and proxy to an internal origin (e.g. http://localhost:8080), so
// request.nextUrl is the WRONG base for building absolute redirects. The Host /
// x-forwarded-host headers carry the real public domain.
function publicHost(request: NextRequest): { host: string; proto: string } {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "")
  return { host, proto }
}

function withAppNoIndex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", APP_ROBOTS_HEADER)
  return response
}

// Redirects built after getUser() must carry the cookies the token refresh
// wrote onto `response` (new session, or the clearing of an invalid one), or
// the browser keeps its stale token - the @supabase/ssr contract.
function redirectWithCookies(url: string, response: NextResponse) {
  const redirect = NextResponse.redirect(url)
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie)
  }
  return redirect
}

export async function updateSession(request: NextRequest) {
  const { host, proto } = publicHost(request)
  const { pathname } = request.nextUrl

  // Every self-host hostname serves the app on the same origin.
  if (pathname === "/") {
    return withAppNoIndex(NextResponse.redirect(`${proto}://${host}/dashboard`))
  }

  // Self-host setup and security guidance must work before Supabase is
  // configured or reachable. Keep the proxy's forwarded nonce/CSP headers.
  if (pathname === "/docs" || pathname === "/security") {
    return withAppNoIndex(NextResponse.next({ request }))
  }

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: Array<{
            name: string
            value: string
            options?: CookieOptions
          }>
        ) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  // MUST call getUser() (not getSession()) to refresh token
  // getUser() validates JWT against Supabase servers — getSession() is insecure
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Unauthenticated user visiting a protected route → redirect to /login
  // Preserve return URL so user lands back after auth. isProtectedAppPath
  // covers the whole (dashboard) route group, not just /dashboard, so the
  // boundary holds even if a future page forgets its own getUser() guard.
  if (!user && isProtectedAppPath(pathname)) {
    return withAppNoIndex(
      redirectWithCookies(
        `${proto}://${host}/login?next=${encodeURIComponent(pathname)}`,
        response
      )
    )
  }

  // Authenticated user visiting /login → redirect to /dashboard
  if (user && pathname === "/login") {
    return withAppNoIndex(
      redirectWithCookies(`${proto}://${host}/dashboard`, response)
    )
  }

  return withAppNoIndex(response)
}
