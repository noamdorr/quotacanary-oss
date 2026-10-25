import {
  type Authorized,
  authorizeApiRequest,
  withRateLimitHeaders,
  withScopesHeader,
} from "@/lib/api/authorize"
import {
  parseCredential,
  readJsonObject,
  writeFailureResponse,
} from "@/lib/api/connection-input"
import { jsonError, jsonOk } from "@/lib/api/respond"
import {
  findOwnedConnection,
  rekeyOwnedConnection,
  removeOwnedConnection,
  renameOwnedConnection,
} from "@/lib/connection-writes"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

type Context = { params: Promise<{ id: string }> }
type Gate = Authorized & { ok: true }

// Unknown and foreign ids answer alike, so probing ids reveals nothing about
// other accounts.
function notFound() {
  return jsonError(404, "not_found", "Connection not found.")
}

// PATCH /api/v1/connections/:id { apiKey | credentials } rekeys, { name }
// renames; both together apply the key first and stop if it fails.
export async function PATCH(req: Request, { params }: Context) {
  const gate = await authorizeApiRequest(req, "write")
  if (!gate.ok) return gate.res
  return withScopesHeader(await patch(req, params, gate), gate.auth)
}

async function patch(req: Request, params: Context["params"], gate: Gate) {
  const body = await readJsonObject(req)
  if (!body) return jsonError(400, "invalid_body", "Send a JSON object.")
  const credential = parseCredential(body)
  if (credential === null)
    return jsonError(
      400,
      "invalid_body",
      "apiKey must be a non-empty string, or credentials an object of strings."
    )
  const { name } = body
  if (name !== undefined && typeof name !== "string")
    return jsonError(400, "invalid_body", "name must be a string.")
  if (credential === undefined && name === undefined)
    return jsonError(
      400,
      "invalid_body",
      "Send apiKey (or credentials) to rekey, name to rename, or both."
    )

  const { id } = await params
  const admin = createAdminClient()
  if (!(await findOwnedConnection(admin, gate.auth.userId, id)))
    return notFound()

  if (credential !== undefined) {
    const rekeyed = await rekeyOwnedConnection(
      admin,
      admin,
      gate.auth.userId,
      id,
      credential
    )
    if (!rekeyed.ok) return writeFailureResponse(rekeyed)
  }
  if (name !== undefined) {
    const renamed = await renameOwnedConnection(
      admin,
      gate.auth.userId,
      id,
      name
    )
    if (!renamed.ok) return writeFailureResponse(renamed)
  }

  return withRateLimitHeaders(jsonOk({ connectionId: id }), gate.rate)
}

// DELETE /api/v1/connections/:id -> 204. Balances cascade with the row.
export async function DELETE(req: Request, { params }: Context) {
  const gate = await authorizeApiRequest(req, "write")
  if (!gate.ok) return gate.res
  return withScopesHeader(await remove(params, gate), gate.auth)
}

async function remove(params: Context["params"], gate: Gate) {
  const { id } = await params
  const admin = createAdminClient()
  if (!(await findOwnedConnection(admin, gate.auth.userId, id)))
    return notFound()

  const removed = await removeOwnedConnection(admin, gate.auth.userId, id)
  if (!removed.ok) return writeFailureResponse(removed)

  const res = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  })
  return withRateLimitHeaders(res, gate.rate)
}
