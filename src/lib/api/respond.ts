import { NextResponse } from "next/server"

// Returns a 200 JSON response with no-store caching.
export function jsonOk(data: unknown): NextResponse {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  })
}

// Returns a JSON error response with a standard { error: { code, message } }
// envelope and no-store caching. Routes may append additional headers
// (WWW-Authenticate, RateLimit-*, Retry-After) before returning.
export function jsonError(
  status: number,
  code: string,
  message?: string
): NextResponse {
  return NextResponse.json(
    { error: { code, message: message ?? code } },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  )
}
