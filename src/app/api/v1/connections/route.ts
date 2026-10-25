import { randomUUID } from "node:crypto"
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
import { jsonError } from "@/lib/api/respond"
import {
  UUID_PATTERN,
  findConnectionByRequestId,
  findConnectionWithSameKey,
  insertConnectionForUser,
  prepareConnection,
  seedPoolThresholds,
} from "@/lib/connection-writes"
import { createAdminClient } from "@/lib/supabase/admin"
import { parsePoolThresholds } from "@/lib/thresholds"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
// The vendor check is one live balance read, same budget as the web connect.
export const maxDuration = 30

// POST /api/v1/connections { toolId, name, apiKey | credentials,
// watchedCreditTypes?, thresholds?, requestId? } -> 201 { connectionId }, or
// 200 with the same body when requestId already created a connection for this
// user, or 200 { connectionId, existing: true } when the user already has this
// tool connected with this exact key (QUO-293). thresholds is the
// pool_thresholds map ({ [creditType]: { low, critical } }), so a moved
// connection keeps the Mac's Warn below (QUO-291).
// "Move to account" from the Mac app's side (QUO-187, decision 5): the key is
// validated with the tool's adapter, encrypted and stored exactly like a web
// connection, and the hosted poller takes over from there.
export async function POST(req: Request) {
  const gate = await authorizeApiRequest(req, "write")
  if (!gate.ok) return gate.res
  return withScopesHeader(await create(req, gate), gate.auth)
}

async function create(req: Request, gate: Authorized & { ok: true }) {
  const body = await readJsonObject(req)
  if (!body) return jsonError(400, "invalid_body", "Send a JSON object.")

  const { toolId, name, watchedCreditTypes, thresholds, requestId } = body
  if (typeof toolId !== "string" || !toolId)
    return jsonError(400, "invalid_body", "toolId is required.")
  if (typeof name !== "string" || !name.trim())
    return jsonError(400, "invalid_body", "name is required.")
  const credential = parseCredential(body)
  if (credential === undefined)
    return jsonError(400, "invalid_body", "apiKey is required.")
  if (credential === null)
    return jsonError(
      400,
      "invalid_body",
      "apiKey must be a non-empty string, or credentials an object of strings."
    )
  if (
    watchedCreditTypes !== undefined &&
    (!Array.isArray(watchedCreditTypes) ||
      !watchedCreditTypes.every((w) => typeof w === "string"))
  )
    return jsonError(
      400,
      "invalid_body",
      "watchedCreditTypes must be an array of strings."
    )
  const poolThresholds =
    thresholds === undefined ? undefined : parsePoolThresholds(thresholds)
  if (poolThresholds && !poolThresholds.ok)
    return jsonError(400, "invalid_body", poolThresholds.error)
  // Optional idempotency key: a retried request with the same id returns the
  // connection the first attempt created instead of a duplicate.
  if (requestId !== undefined && !UUID_PATTERN.test(String(requestId)))
    return jsonError(400, "invalid_body", "requestId must be a UUID.")

  // userId comes ONLY from the verified token, never from the body.
  const admin = createAdminClient()
  // A retry of a move that already saved answers before the vendor check, so
  // a slow or flaky vendor can't turn a done move into an error (QUO-290).
  if (requestId !== undefined) {
    const existing = await findConnectionByRequestId(
      admin,
      gate.auth.userId,
      String(requestId)
    )
    if (existing) return created(existing, 200, gate)
  }
  // The same key moved from two Macs, or moved when the web already has it,
  // is the connection the user already has: no second row polling and
  // emailing for one key, and no vendor call (QUO-293).
  const sameKey = await findConnectionWithSameKey(
    admin,
    gate.auth.userId,
    toolId,
    credential
  )
  if (sameKey) return created(sameKey.connectionId, 200, gate, true)

  const prepared = await prepareConnection(admin, {
    toolId,
    name,
    tags: [],
    watchedCreditTypes: (watchedCreditTypes as string[] | undefined) ?? [],
    credential,
    poolThresholds: poolThresholds?.thresholds,
  })
  if (!prepared.ok) return writeFailureResponse(prepared)

  const inserted = await insertConnectionForUser(
    admin,
    gate.auth.userId,
    prepared.prepared,
    requestId === undefined ? randomUUID() : String(requestId)
  )
  if (!inserted.ok) return writeFailureResponse(inserted)
  // The connection exists either way, so a failed threshold write still
  // answers 201: an error would only send the caller into a retry that the
  // request id answers without them. It falls back to the tool defaults.
  if (prepared.prepared.poolThresholds)
    await seedPoolThresholds(
      admin,
      gate.auth.userId,
      inserted.connectionId,
      prepared.prepared.poolThresholds
    )
  return created(inserted.connectionId, 201, gate)
}

function created(
  connectionId: string,
  status: 200 | 201,
  gate: Authorized & { ok: true },
  existing = false
) {
  const res = NextResponse.json(
    existing ? { connectionId, existing: true } : { connectionId },
    { status, headers: { "Cache-Control": "no-store" } }
  )
  return withRateLimitHeaders(res, gate.rate)
}
