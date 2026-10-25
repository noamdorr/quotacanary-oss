import { z } from "zod/v4"
import catalogFile from "../../../catalog/tools.json"
import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, BalanceReading, ToolAdapter } from "./types"

const jsonPath = z
  .string()
  .min(1)
  .describe(
    "Dotted path into the JSON body, e.g. data.credits; a numeric segment indexes an array (0 for a bare-array body)"
  )

// The vendor-reported error family (QUO-193): a flag in the body selects a
// message chain, or the chain itself is the trigger. `when` is one of three
// fixed shapes; `fallback` is the copy when the flag fires but no message is
// found, so it only makes sense beside a `when`.
const bodyErrorWhenSchema = z.union([
  z.strictObject({ path: jsonPath, equals: z.boolean() }),
  z.strictObject({ path: jsonPath, notEquals: z.string() }),
  z.strictObject({ path: jsonPath, truthy: z.literal(true) }),
])

const bodyErrorSchema = z
  .strictObject({
    when: bodyErrorWhenSchema
      .optional()
      .describe(
        "The flag that marks the body as an error. Absent: a non-empty string in messagePaths is itself the error"
      ),
    messagePaths: z
      .array(jsonPath)
      .min(1)
      .describe("Tried in order; the first non-empty string is the error"),
    keyRejectedWhen: z
      .strictObject({ path: jsonPath, equals: z.string() })
      .optional()
      .describe(
        "With when only: when the value at path is this string, the key was rejected (copy: rejected this key) instead of the message"
      ),
    fallback: z
      .enum(["error", "invalid_key"])
      .optional()
      .describe(
        "With when only: the copy when the flag fires and no message is found (default error)"
      ),
    on: z
      .enum(["2xx", "non2xx", "any"])
      .default("2xx")
      .describe(
        "Which responses carry the body to read; on a failing status the body is read after the status overrides"
      ),
  })
  .refine((rule) => rule.when !== undefined || rule.fallback === undefined, {
    message: "bodyError.fallback needs a when",
  })
  .refine(
    (rule) => rule.when !== undefined || rule.keyRejectedWhen === undefined,
    { message: "bodyError.keyRejectedWhen needs a when" }
  )

// One reading per pool. Exactly one of two shapes:
// - balance given: balance is the reading; limit (if given) is reported only
//   when it parses to a number above zero; otherwise used (if given) makes
//   limit = balance + used.
// - balance absent: limit is required and reported as-is; used defaults to 0
//   and balance = limit - used.
// A pool whose required value is missing or non-numeric is dropped; when no
// pool survives the whole reading is an unexpected response.
const poolSchema = z
  .strictObject({
    creditType: z.string().min(1),
    label: z.string().min(1),
    unit: z.enum(["credits", "usd", "gb", "minutes"]),
    balance: jsonPath.optional(),
    limit: jsonPath.optional(),
    used: jsonPath.optional(),
  })
  .refine((pool) => pool.balance !== undefined || pool.limit !== undefined, {
    message: "a pool needs a balance path or a limit path",
  })

export const catalogEntrySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).describe("Display name used in error copy"),
  topupUrl: z
    .string()
    .startsWith("https://")
    .optional()
    .describe(
      "Where the user buys more credits; mirrors tools.topup_url on the hosted side"
    ),
  request: z.strictObject({
    method: z.enum(["GET", "POST"]),
    url: z
      .string()
      .startsWith("https://")
      .describe(
        "Absolute URL. With auth.in = path it contains {key}, replaced by the percent-encoded key"
      ),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("Static headers sent as-is beside the auth header"),
    body: z.string().optional().describe("Raw request body, sent verbatim"),
  }),
  auth: z
    .strictObject({
      in: z.enum(["header", "query", "path"]),
      name: z
        .string()
        .min(1)
        .optional()
        .describe("Header or query parameter name; absent for path"),
      format: z
        .string()
        .default("{key}")
        .describe("Header value template; {key} is replaced by the raw key"),
    })
    .refine((auth) => auth.in === "path" || auth.name !== undefined, {
      message: "auth.name is required for header and query placement",
    }),
  errors: z
    .record(z.string().regex(/^[1-5]\d\d$/), z.enum(["invalid_key", "http"]))
    .optional()
    .describe(
      "Per-status overrides on top of the default {401: invalid_key}; every other non-2xx status is http"
    ),
  errorPath: jsonPath
    .optional()
    .describe(
      "When a 2xx body carries a non-empty string here, fail with that string"
    ),
  rejectWhen: z
    .strictObject({ path: jsonPath, equals: z.boolean() })
    .optional()
    .describe(
      "When the value at path equals this boolean, the key was rejected (vendors that answer 200 on a bad key)"
    ),
  bodyError: bodyErrorSchema
    .optional()
    .describe(
      "A vendor-reported error in the body: a flag at when.path selects the first non-empty string in messagePaths, or that string is the trigger"
    ),
  pools: z.array(poolSchema).min(1),
})

export type CatalogEntry = z.input<typeof catalogEntrySchema>

// The file shape: catalog/tools.json at the repo root, read by this
// interpreter and by the Mac app's Swift reader (QUO-190).
export const catalogSchema = z
  .strictObject({
    $schema: z.string().optional(),
    tools: z.array(catalogEntrySchema),
  })
  .refine(
    (file) => new Set(file.tools.map((t) => t.id)).size === file.tools.length,
    { message: "tool ids must be unique" }
  )

// catalog/tools.schema.json is this, written out; a contract test keeps the
// committed file equal to it so the Swift side never reads a stale schema.
export function catalogJsonSchema(): unknown {
  return z.toJSONSchema(catalogSchema, { io: "input" })
}

// What a non-2xx status means unless the entry says otherwise. Every other
// failing status renders as "<name> returned <status>." (the "http" kind).
const DEFAULT_ERRORS: Record<string, "invalid_key" | "http"> = {
  "401": "invalid_key",
}

function buildRequest(
  entry: z.output<typeof catalogEntrySchema>,
  apiKey: string
): { url: string; init: RequestInit } {
  const { request, auth } = entry
  const headers: Record<string, string> = { ...request.headers }
  let url = request.url
  if (auth.in === "header" && auth.name) {
    headers[auth.name] = auth.format.replace("{key}", apiKey)
  } else if (auth.in === "query" && auth.name) {
    const separator = url.includes("?") ? "&" : "?"
    url = `${url}${separator}${auth.name}=${encodeURIComponent(apiKey)}`
  } else {
    url = url.replace("{key}", encodeURIComponent(apiKey))
  }
  const init: RequestInit = {}
  if (request.method !== "GET") init.method = request.method
  if (Object.keys(headers).length > 0) init.headers = headers
  if (request.body !== undefined) init.body = request.body
  return { url, init }
}

function readPath(body: unknown, path: string): unknown {
  let current = body
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined
    // Arrays are objects, so a numeric segment indexes them here; the Swift
    // reader mirrors this explicitly.
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function bodyErrorFires(
  data: unknown,
  when: z.output<typeof bodyErrorWhenSchema>
): boolean {
  const value = readPath(data, when.path)
  if ("equals" in when) return value === when.equals
  if ("notEquals" in when) return value !== when.notEquals
  return Boolean(value)
}

// The error a bodyError rule reports for this body, or null when it does not
// apply. With `when`: the flag decides, then the first non-empty string in
// the chain or the fallback copy. Without: the first non-empty string, if any.
function readBodyError(
  data: unknown,
  rule: z.output<typeof bodyErrorSchema>,
  name: string
): string | null {
  if (rule.when !== undefined && !bodyErrorFires(data, rule.when)) return null
  if (
    rule.keyRejectedWhen !== undefined &&
    readPath(data, rule.keyRejectedWhen.path) === rule.keyRejectedWhen.equals
  ) {
    return `${name} rejected this key.`
  }
  for (const path of rule.messagePaths) {
    const message = readPath(data, path)
    if (typeof message === "string" && message !== "") return message
  }
  if (rule.when === undefined) return null
  return rule.fallback === "invalid_key"
    ? `${name} rejected this key.`
    : `${name} returned an error.`
}

function readPool(
  data: unknown,
  pool: z.output<typeof poolSchema>
): { balance: number; balanceLimit: number | null } | null {
  const at = (path: string | undefined) =>
    path === undefined ? null : finiteOrNull(readPath(data, path))
  const used = at(pool.used)
  if (pool.balance === undefined) {
    const limit = at(pool.limit)
    if (limit === null) return null
    return { balance: limit - (used ?? 0), balanceLimit: limit }
  }
  const balance = at(pool.balance)
  if (balance === null) return null
  if (pool.limit !== undefined) {
    const limit = at(pool.limit)
    return { balance, balanceLimit: limit !== null && limit > 0 ? limit : null }
  }
  return { balance, balanceLimit: used === null ? null : balance + used }
}

export function catalogAdapter(input: CatalogEntry): ToolAdapter {
  const entry = catalogEntrySchema.parse(input)
  const errors = { ...DEFAULT_ERRORS, ...entry.errors }
  const unexpected = `${entry.name} returned an unexpected response.`
  return {
    toolId: entry.id,
    async readBalance(apiKey: string): Promise<AdapterResult> {
      const { url, init } = buildRequest(entry, apiKey)
      let res: Response
      try {
        res = await timedFetch(url, init)
      } catch {
        return { ok: false, error: `Couldn't reach ${entry.name}.` }
      }
      const kind = errors[String(res.status)] ?? (res.ok ? "ok" : "http")
      if (kind === "invalid_key") {
        return { ok: false, error: `${entry.name} rejected this key.` }
      }
      const bodyError = entry.bodyError
      if (kind === "http") {
        if (bodyError !== undefined && bodyError.on !== "2xx") {
          let failing: unknown
          try {
            failing = await res.json()
          } catch {
            failing = undefined
          }
          const message = readBodyError(failing, bodyError, entry.name)
          if (message !== null) return { ok: false, error: message }
        }
        return { ok: false, error: `${entry.name} returned ${res.status}.` }
      }
      let data: unknown
      try {
        data = await res.json()
      } catch {
        return { ok: false, error: unexpected }
      }
      if (bodyError !== undefined && bodyError.on !== "non2xx") {
        const message = readBodyError(data, bodyError, entry.name)
        if (message !== null) return { ok: false, error: message }
      }
      if (entry.errorPath !== undefined) {
        const message = readPath(data, entry.errorPath)
        if (typeof message === "string" && message !== "") {
          return { ok: false, error: message }
        }
      }
      if (
        entry.rejectWhen !== undefined &&
        readPath(data, entry.rejectWhen.path) === entry.rejectWhen.equals
      ) {
        return { ok: false, error: `${entry.name} rejected this key.` }
      }
      const balances: BalanceReading[] = []
      for (const pool of entry.pools) {
        const reading = readPool(data, pool)
        if (reading === null) continue
        balances.push({
          creditType: pool.creditType,
          label: pool.label,
          ...reading,
          unit: pool.unit,
        })
      }
      if (balances.length === 0) return { ok: false, error: unexpected }
      return { ok: true, balances }
    },
  }
}

let adapters: Record<string, ToolAdapter> | undefined

// Every catalog entry as a ToolAdapter, keyed by tool id. Parsed once; a
// malformed catalog throws on first use rather than silently serving nothing.
export function catalogAdapters(): Record<string, ToolAdapter> {
  if (adapters === undefined) {
    adapters = {}
    for (const entry of catalogSchema.parse(catalogFile).tools) {
      adapters[entry.id] = catalogAdapter(entry)
    }
  }
  return adapters
}

// The catalog adapter for one id, for the per-tool fixture tests.
export function catalogAdapterFor(toolId: string): ToolAdapter {
  const adapter = catalogAdapters()[toolId]
  if (adapter === undefined) throw new Error(`${toolId} is not in the catalog`)
  return adapter
}
