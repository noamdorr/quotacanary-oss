import {
  NONCE_HEADER,
  buildContentSecurityPolicy,
  createNonce,
} from "@/lib/csp"
import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  const nonce = createNonce()
  const csp = buildContentSecurityPolicy(nonce)

  // Next stamps the nonce it finds in the REQUEST's CSP header onto its own
  // inline bootstrap and RSC-payload scripts while rendering; the response
  // header is what the browser enforces. Both have to carry the same value.
  request.headers.set("content-security-policy", csp)
  request.headers.set(NONCE_HEADER, nonce)

  const response = await updateSession(request)
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
