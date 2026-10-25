// Errors GET /api/v1/pools can return, rendered as the /docs error table.
// error-docs.test.ts fails when this list and the route's jsonError() calls
// disagree, so add a row here whenever the route learns a new error.
export const POOLS_API_ERRORS = [
  { status: "401", code: "unauthorized", when: "Missing or invalid token." },
  {
    status: "403",
    code: "insufficient_scope",
    when: "Valid token, but it does not have the read scope.",
  },
  {
    status: "400",
    code: "invalid_status",
    when: "?status= contains an unrecognized value.",
  },
  {
    status: "429",
    code: "rate_limited",
    when: "Over 60 requests per minute.",
  },
  { status: "500", code: "internal", when: "Something went wrong on our end." },
] as const

// Errors the connection write endpoints (POST /api/v1/connections, PATCH and
// DELETE /api/v1/connections/:id) can return. Pinned the same way: the test
// scans the two routes plus lib/api/authorize.ts and connection-input.ts.
export const CONNECTIONS_API_ERRORS = [
  { status: "401", code: "unauthorized", when: "Missing or invalid token." },
  {
    status: "403",
    code: "insufficient_scope",
    when: "Valid token, but it does not have the write scope.",
  },
  {
    status: "400",
    code: "invalid_body",
    when: "The JSON body is missing, malformed, or a field fails validation. The message says which.",
  },
  {
    status: "400",
    code: "unsupported_tool",
    when: "toolId is not a tool QuotaCanary can poll.",
  },
  {
    status: "422",
    code: "key_rejected",
    when: "The vendor rejected the key or could not be reached. Nothing was saved; the message is the vendor check's.",
  },
  {
    status: "404",
    code: "not_found",
    when: "No connection with that id on this account.",
  },
  {
    status: "429",
    code: "rate_limited",
    when: "Over 60 requests per minute.",
  },
  { status: "500", code: "internal", when: "Something went wrong on our end." },
] as const
