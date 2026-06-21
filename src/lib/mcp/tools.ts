import { type PoolPayload, serializePoolRow } from "@/lib/api/serialize"
import { KNOWN_STATUSES, parseStatusFilter } from "@/lib/api/status-filter"
import { consumeRateLimit } from "@/lib/auth/api-token"
import { listConnectionsWithBalance } from "@/lib/db/connections"
import { toPoolRows } from "@/lib/pool-rows"
import { createAdminClient } from "@/lib/supabase/admin"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

// Tool-call result shape (a subset of the SDK's CallToolResult). We avoid
// importing the SDK types here so the registration stays decoupled from a
// specific transport; the McpServer validates against these tools' schemas.
type ToolResult = {
  content: { type: "text"; text: string }[]
  structuredContent?: { pools: PoolPayload[] }
  isError?: boolean
}

// The per-request identity our route's verifyToken stashes on
// AuthInfo.extra. Tool handlers receive it as extra.authInfo.extra.
type AuthContext = { userId: string; tokenId: string }

// outputSchema mirrors PoolPayload exactly (one entry per serialized pool).
// Defined as a ZodRawShape ({ pools: ... }) as required by registerTool.
const poolPayloadSchema = z.object({
  connectionId: z.string(),
  connectionName: z.string(),
  tool: z.object({
    id: z.string(),
    name: z.string(),
    topupUrl: z.string().nullable(),
  }),
  creditType: z.string().nullable(),
  label: z.string().nullable(),
  unit: z.string().nullable(),
  balance: z.number().nullable(),
  balanceLimit: z.number().nullable(),
  recordedAt: z.string().nullable(),
  status: z.enum([
    "healthy",
    "low",
    "critical",
    "stale",
    "error",
    "disconnected",
    "nodata",
  ]),
  burn: z.object({ perDay: z.number(), daysLeft: z.number() }).nullable(),
  eta: z.object({ short: z.string(), long: z.string() }),
  thresholds: z.object({
    low: z.number().nullable(),
    critical: z.number().nullable(),
  }),
})

const outputSchema = { pools: z.array(poolPayloadSchema) }

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: "text", text }], isError }
}

// Pulls the authenticated identity off the tool handler's `extra`. The shape
// is populated by the route's verifyToken (AuthInfo.extra). Returns null if
// the context is missing - the handlers turn that into an isError result
// rather than trusting any caller-supplied identity.
function readAuth(extra: unknown): AuthContext | null {
  const authInfo = (extra as { authInfo?: { extra?: unknown } } | undefined)
    ?.authInfo?.extra as Partial<AuthContext> | undefined
  if (!authInfo?.userId || !authInfo.tokenId) return null
  return { userId: authInfo.userId, tokenId: authInfo.tokenId }
}

// Shared rate-limit + in-process fetch + serialize used by both tools.
// Returns either the user's pools, or a ready-made isError ToolResult to
// short-circuit on (rate limit, missing auth, or a data-layer failure).
async function fetchPools(
  extra: unknown
): Promise<{ pools: PoolPayload[] } | { error: ToolResult }> {
  const auth = readAuth(extra)
  if (!auth) {
    return { error: textResult("Not authenticated.", true) }
  }

  const allowed = await consumeRateLimit(auth.tokenId)
  if (!allowed) {
    return {
      error: textResult(
        "Rate limited. Slow down and try again in a minute.",
        true
      ),
    }
  }

  try {
    const supabase = createAdminClient()
    const connections = await listConnectionsWithBalance(supabase, auth.userId)
    const pools = toPoolRows(connections).map(serializePoolRow)
    return { pools }
  } catch {
    return {
      error: textResult(
        "Could not read your balances right now. Try again shortly.",
        true
      ),
    }
  }
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US")

// One human-readable line per pool, in QuotaCanary's dry voice. No em dashes.
function poolDigestLine(p: PoolPayload): string {
  const label = p.label ?? p.creditType ?? "Credits"
  if (p.status === "nodata" || p.balance === null) {
    return `${p.tool.name} - ${label}: no reading yet`
  }
  const unit = p.unit ? ` ${p.unit}` : ""
  const amount = `${NUMBER_FORMAT.format(p.balance)}${unit}`
  return `${p.tool.name} - ${label}: ${amount} (${p.status}, ${p.eta.short})`
}

function digest(pools: PoolPayload[], emptyLine: string): string {
  if (pools.length === 0) return emptyLine
  return pools.map(poolDigestLine).join("\n")
}

export function registerQuotaCanaryTools(server: McpServer) {
  // ── list_balances ─────────────────────────────────────────────────────────
  server.registerTool(
    "list_balances",
    {
      title: "List credit balances",
      description:
        "The morning brief for a user's API credit stack: lists every " +
        "connected tool's balance, status, and burn-out ETA. Reach for this " +
        "to answer 'what's running low?' or to summarize remaining credits " +
        "across all tools. Optionally filter by status (a single value or a " +
        "comma list) to show only what needs attention.",
      inputSchema: {
        status: z
          .string()
          .optional()
          .describe(
            `Optional status filter. One value or a comma-separated list. Valid values: ${KNOWN_STATUSES.join(
              ", "
            )}. Omit to return every pool.`
          ),
      },
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: { status?: string }, extra): Promise<ToolResult> => {
      // Validate the status filter BEFORE spending the rate-limit budget or
      // touching the data layer.
      const filter = parseStatusFilter(args?.status ?? null)
      if (!filter.ok) {
        return textResult(
          `Invalid status. Valid values: ${KNOWN_STATUSES.join(", ")}.`,
          true
        )
      }

      const fetched = await fetchPools(extra)
      if ("error" in fetched) return fetched.error

      let pools = fetched.pools
      if (filter.statuses !== null) {
        const statuses = filter.statuses
        pools = pools.filter((p) => statuses.has(p.status))
      }

      return {
        content: [
          { type: "text", text: digest(pools, "No tools connected yet.") },
        ],
        structuredContent: { pools },
      }
    }
  )

  // ── get_tool_balance ──────────────────────────────────────────────────────
  server.registerTool(
    "get_tool_balance",
    {
      title: "Get one tool's balance",
      description:
        "Returns the credit balance(s) for a single connected tool, matched " +
        "by name (case-insensitive, substring). Use this when the user asks " +
        "about one specific tool, e.g. 'how many Apollo credits are left?'. " +
        "Returns every watched pool on the matching tool.",
      inputSchema: {
        toolName: z
          .string()
          .describe(
            "The tool name to look up, e.g. 'Apollo'. Case-insensitive; a " +
              "substring match is enough."
          ),
      },
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: { toolName: string }, extra): Promise<ToolResult> => {
      const needle = args.toolName.trim().toLowerCase()
      if (!needle) {
        return {
          content: [{ type: "text", text: "Give me a tool name to look up." }],
          structuredContent: { pools: [] },
          isError: true,
        }
      }

      const fetched = await fetchPools(extra)
      if ("error" in fetched) return fetched.error

      const pools = fetched.pools.filter((p) =>
        p.tool.name.toLowerCase().includes(needle)
      )

      if (pools.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No connected tool named "${args.toolName}". Check the name or connect it first.`,
            },
          ],
          structuredContent: { pools },
        }
      }

      return {
        content: [{ type: "text", text: digest(pools, "") }],
        structuredContent: { pools },
      }
    }
  )
}
