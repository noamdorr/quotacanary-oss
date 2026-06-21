import { resolveHost } from "@/lib/host-routing"
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

export async function updateSession(request: NextRequest) {
  const { host, proto } = publicHost(request)
  const surface = resolveHost(host)
  const { pathname, search } = request.nextUrl

  if (surface === "marketing") {
    // The marketing host only serves the homepage + Next internals. App
    // paths don't exist here - bounce them to the app subdomain.
    const appOnly =
      /^\/(dashboard|login|update-password|alerts|settings|security|tools|connect|auth|api|mcp)(\/|$)/
    if (appOnly.test(pathname)) {
      const appHost = host.replace(/^(www\.|marketing\.)?/, "app.")
      return NextResponse.redirect(`${proto}://${appHost}${pathname}${search}`)
    }
    // Anonymous marketing visitors need no session work.
    return NextResponse.next({ request })
  }

  // surface === "app": send the app root to the dashboard, then fall through
  // to the existing session-refresh + route-protection logic unchanged.
  if (pathname === "/") {
    return withAppNoIndex(NextResponse.redirect(`${proto}://${host}/dashboard`))
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
  // Preserve return URL so user lands back after auth
  if (!user && pathname.startsWith("/dashboard")) {
    return withAppNoIndex(
      NextResponse.redirect(
        `${proto}://${host}/login?next=${encodeURIComponent(pathname)}`
      )
    )
  }

  // Authenticated user visiting /login → redirect to /dashboard
  if (user && pathname === "/login") {
    return withAppNoIndex(NextResponse.redirect(`${proto}://${host}/dashboard`))
  }

  return withAppNoIndex(response)
}
