import { verifyApiTokenByRaw } from "@/lib/auth/api-token"
import { registerQuotaCanaryTools } from "@/lib/mcp/tools"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { createMcpHandler, withMcpAuth } from "mcp-handler"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Stateless Streamable HTTP MCP server, served at /mcp. No Redis (no SSE
// resumability needed); each request authenticates itself via the bearer token
// below, so it needs no session gate from the app middleware (which only
// protects /dashboard). basePath "" makes the handler's endpoint exactly /mcp.
const handler = createMcpHandler(
  (server) => {
    registerQuotaCanaryTools(server)
  },
  { serverInfo: { name: "QuotaCanary", version: "1.0.0" } },
  { basePath: "" }
)

// Verifies the bearer token against our PAT store and, on success, stashes the
// owning user + token id on AuthInfo.extra. Tool handlers read this back as
// `extra.authInfo.extra` - the only source of the per-request identity (the
// caller can never supply a user id directly). Scopes come from the token row;
// withMcpAuth rejects tokens missing the "read" scope at the auth boundary.
const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined
  const auth = await verifyApiTokenByRaw(bearerToken)
  if (!auth) return undefined
  return {
    token: bearerToken,
    scopes: auth.scopes,
    clientId: auth.userId,
    extra: { userId: auth.userId, tokenId: auth.tokenId },
  }
}

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: ["read"],
})

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
