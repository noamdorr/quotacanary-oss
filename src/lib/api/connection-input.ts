import { jsonError } from "@/lib/api/respond"
import type {
  ConnectionCredential,
  WriteFailure,
} from "@/lib/connection-writes"
import { credentialInputName } from "@/lib/credentials"
import type { NextResponse } from "next/server"

// Request-body helpers for the connection write endpoints (QUO-187).

export type JsonObject = Record<string, unknown>

// The parsed JSON body as an object, or null when it is missing, malformed
// or not an object. The route turns null into 400 invalid_body.
export async function readJsonObject(req: Request): Promise<JsonObject | null> {
  try {
    const parsed: unknown = await req.json()
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null
    return parsed as JsonObject
  } catch {
    return null
  }
}

// `apiKey` is the finished secret for single-field tools. `credentials` is one
// value per declared credential field (keyed by the field's name) for tools
// that need more than one; it becomes the same form the web connect flow
// submits, so the shared writer validates it against the tool's definition.
// Returns undefined when neither is present and null when one is malformed.
export function parseCredential(
  body: JsonObject
): ConnectionCredential | null | undefined {
  const { apiKey, credentials } = body
  if (apiKey !== undefined) {
    return typeof apiKey === "string" && apiKey.trim() ? apiKey : null
  }
  if (credentials === undefined) return undefined
  if (
    !credentials ||
    typeof credentials !== "object" ||
    Array.isArray(credentials)
  )
    return null
  const form = new FormData()
  for (const [name, value] of Object.entries(credentials)) {
    if (typeof value !== "string") return null
    form.set(credentialInputName({ name, label: name, type: "text" }), value)
  }
  return form
}

// One mapping from the shared writer's failure codes to HTTP, so the three
// endpoints answer identically. `message` is the writer's own text: for a
// rejected key that is the adapter's error, the same line the web shows.
export function writeFailureResponse(failure: WriteFailure): NextResponse {
  switch (failure.code) {
    case "invalid":
      return jsonError(400, "invalid_body", failure.error)
    case "unsupported_tool":
      return jsonError(400, "unsupported_tool", failure.error)
    case "key_rejected":
      return jsonError(422, "key_rejected", failure.error)
    case "not_found":
      return jsonError(404, "not_found", failure.error)
    case "db":
      return jsonError(500, "internal", failure.error)
  }
}
