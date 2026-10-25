import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { APP_URL } from "@/components/marketing/constants"
import { CONNECTIONS_API_ERRORS, POOLS_API_ERRORS } from "@/lib/api/error-docs"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "API, MCP & webhooks docs - QuotaCanary",
  description:
    "REST API, remote MCP server, and outbound webhooks for your QuotaCanary credit balances.",
}

// Shared block styles for code snippets
const CODE_BLOCK: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 13,
  lineHeight: 1.6,
  background: "var(--ink)",
  color: "var(--cream)",
  borderRadius: 8,
  padding: "16px 20px",
  overflowX: "auto",
  margin: 0,
  whiteSpace: "pre",
}

const INLINE_CODE: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 13,
  background: "var(--cream-3)",
  borderRadius: 4,
  padding: "1px 5px",
}

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 48,
}

const H2_STYLE: React.CSSProperties = {
  fontSize: 28,
  margin: "0 0 16px",
}

const H3_STYLE: React.CSSProperties = {
  fontSize: 18,
  margin: "28px 0 10px",
  fontFamily: "var(--f-display)",
  fontVariationSettings: '"opsz" 144, "SOFT" 50, "WONK" 0',
  fontWeight: 500,
  letterSpacing: "-0.022em",
}

const PROSE: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.65,
  color: "var(--ink-2, var(--ink))",
  display: "grid",
  gap: 12,
}

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
  lineHeight: 1.5,
}

const TH_STYLE: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontFamily: "var(--f-mono)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--ink-3)",
  borderBottom: "1px solid var(--hairline)",
}

const TD_STYLE: React.CSSProperties = {
  padding: "8px 12px",
  verticalAlign: "top",
  borderBottom: "1px solid var(--hairline-soft)",
}

export default function DocsPage() {
  const appUrl = APP_URL

  return (
    <>
      <a href="#main-content" className="qc-skip-link">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content">
        <article
          className="container qc-docs"
          style={{
            maxWidth: 760,
            marginInline: "auto",
            padding: "72px 0 96px",
          }}
        >
          {/* Page header */}
          <p className="eyebrow" style={{ marginBottom: 16 }}>
            Integrations
          </p>
          <h1
            className="f-display"
            style={{ fontSize: "clamp(38px, 5vw, 56px)", margin: 0 }}
          >
            API &amp; MCP docs
          </h1>
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.5,
              color: "var(--ink-2)",
              marginTop: 16,
              maxWidth: 580,
            }}
          >
            QuotaCanary exposes a REST API and a remote MCP server. Your
            balances, surfaced wherever you already work.
          </p>

          {/* In-page anchor nav */}
          <nav
            aria-label="On this page"
            style={{
              marginTop: 36,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {[
              ["#overview", "Overview"],
              ["#auth", "Authentication"],
              ["#rest-api", "REST API"],
              ["#connections", "Connections"],
              ["#mcp", "MCP server"],
              ["#webhooks", "Webhooks"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "5px 12px",
                  borderRadius: 20,
                  border: "1px solid var(--hairline)",
                  fontSize: 13,
                  fontFamily: "var(--f-ui)",
                  color: "var(--ink-2)",
                  textDecoration: "none",
                  background: "var(--cream-2)",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </a>
            ))}
          </nav>

          {/* ── Section 1: Overview ── */}
          <section id="overview" style={SECTION_STYLE}>
            <h2 className="f-display" style={H2_STYLE}>
              Overview
            </h2>
            <div style={PROSE}>
              <p>
                Everything here is <strong>scoped to your account.</strong> A
                read token fetches your credit-pool data and nothing else. A
                write token can also add, rekey, rename and remove connections,
                which is what the Mac app uses to move a connection to your
                account. Neither can change thresholds, alert destinations, or
                touch any account in any connected service.
              </p>
              <p>Two ways to reach your balances programmatically:</p>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  listStyle: "disc",
                  display: "grid",
                  gap: 8,
                }}
              >
                <li>
                  <strong>REST API</strong> - JSON endpoints under{" "}
                  <code style={INLINE_CODE}>{appUrl}/api/v1/</code>. Good for
                  scripts, dashboards, and any HTTP client.
                </li>
                <li>
                  <strong>Remote MCP server</strong> - a Streamable HTTP
                  connector Claude and Cursor can call natively. Useful for
                  morning-brief prompts and agent workflows that need to know
                  what is running low before deciding what to do.
                </li>
              </ul>
              <p>
                Both use the same personal access tokens, issued from Settings →
                Integrations in your dashboard.
              </p>
            </div>
          </section>

          {/* ── Section 2: Authentication ── */}
          <section id="auth" style={SECTION_STYLE}>
            <h2 className="f-display" style={H2_STYLE}>
              Authentication &amp; tokens
            </h2>
            <div style={PROSE}>
              <p>
                Create a personal access token (PAT) in your dashboard at{" "}
                <a href={`${appUrl}/settings#integrations`}>
                  <code style={INLINE_CODE}>
                    {appUrl}/settings#integrations
                  </code>
                </a>
                . The token is shown <strong>once</strong> at creation - copy it
                before you close the dialog. Only a hash is stored, so there is
                no way to retrieve it later. Revoke it from the same page at any
                time.
              </p>
              <p>
                Tokens start with <code style={INLINE_CODE}>qc_live_</code>.
                Send one in the <code style={INLINE_CODE}>Authorization</code>{" "}
                header on every request:
              </p>
              <pre style={CODE_BLOCK}>
                {"Authorization: Bearer qc_live_..."}
              </pre>

              <h3 style={H3_STYLE}>Scopes</h3>
              <p>
                Pick the scope when you create the token. The default is{" "}
                <code style={INLINE_CODE}>read</code>: list pools over REST and
                MCP. <code style={INLINE_CODE}>write</code> adds the connection
                endpoints below and is the one the Mac app asks for. A write
                token always carries read as well, so one token does both.
                Scopes are fixed at creation: to change one, create a new token
                and revoke the old. Every authenticated response names the
                token&apos;s scopes in an{" "}
                <code style={INLINE_CODE}>X-QuotaCanary-Scopes</code> header
                (for example <code style={INLINE_CODE}>read write</code>), so a
                client can tell what a token can do before it tries.
              </p>

              <h3 style={H3_STYLE}>Rate limit</h3>
              <p>
                60 requests per minute per token. Every authenticated response
                carries <code style={INLINE_CODE}>RateLimit-Limit</code>,{" "}
                <code style={INLINE_CODE}>RateLimit-Remaining</code>, and{" "}
                <code style={INLINE_CODE}>RateLimit-Reset</code> (seconds until
                the window resets). Exceed the limit and you get a{" "}
                <code style={INLINE_CODE}>429</code> with a{" "}
                <code style={INLINE_CODE}>Retry-After</code> header telling you
                how many seconds to wait.
              </p>
            </div>
          </section>

          {/* ── Section 3: REST API ── */}
          <section id="rest-api" style={SECTION_STYLE}>
            <h2 className="f-display" style={H2_STYLE}>
              REST API
            </h2>
            <div style={PROSE}>
              <h3 style={{ ...H3_STYLE, marginTop: 0 }}>GET /api/v1/pools</h3>
              <p>
                Returns every watched credit pool for the token&apos;s owner.
              </p>
              <pre style={CODE_BLOCK}>{`curl ${appUrl}/api/v1/pools \\
  -H "Authorization: Bearer qc_live_..."`}</pre>

              <p>
                Filter by status with the optional{" "}
                <code style={INLINE_CODE}>?status=</code> query parameter
                (comma-separated). Valid values:{" "}
                <code style={INLINE_CODE}>healthy</code>,{" "}
                <code style={INLINE_CODE}>low</code>,{" "}
                <code style={INLINE_CODE}>critical</code>,{" "}
                <code style={INLINE_CODE}>stale</code>,{" "}
                <code style={INLINE_CODE}>error</code>,{" "}
                <code style={INLINE_CODE}>nodata</code>. An invalid value
                returns <code style={INLINE_CODE}>400</code>.
              </p>
              <pre
                style={CODE_BLOCK}
              >{`curl "${appUrl}/api/v1/pools?status=low,critical" \\
  -H "Authorization: Bearer qc_live_..."`}</pre>

              <h3 style={H3_STYLE}>Response shape</h3>
              <pre
                style={CODE_BLOCK}
              >{`{ "pools": [ <PoolPayload>, ... ] }`}</pre>

              <p>Fields on each pool object:</p>
            </div>

            {/* PoolPayload field table */}
            <div
              style={{
                overflowX: "auto",
                marginTop: 16,
                border: "1px solid var(--hairline)",
                borderRadius: 8,
              }}
            >
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Field</th>
                    <th style={TH_STYLE}>Type</th>
                    <th style={TH_STYLE}>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["connectionId", "string", "UUID of the connected tool."],
                    [
                      "connectionName",
                      "string",
                      "Display name you gave the connection.",
                    ],
                    [
                      "keyHint",
                      "string | null",
                      "Last 4 characters of the connection's key, as the dashboard shows it.",
                    ],
                    [
                      "tool.id",
                      "string",
                      "Internal tool slug (e.g. hunter, neverbounce).",
                    ],
                    ["tool.name", "string", "Human-readable tool name."],
                    [
                      "tool.topupUrl",
                      "string | null",
                      "Vendor billing URL for topping up, if known.",
                    ],
                    [
                      "creditType",
                      "string | null",
                      "Which credit pool within the tool (null when not yet read).",
                    ],
                    [
                      "label",
                      "string | null",
                      "Human label for the pool, if the tool exposes one.",
                    ],
                    [
                      "unit",
                      "string | null",
                      'Unit for the balance (e.g. "credits", "emails").',
                    ],
                    [
                      "balance",
                      "number | null",
                      "Current balance. null before the first successful read.",
                    ],
                    [
                      "balanceLimit",
                      "number | null",
                      "Pool cap or monthly limit, if the vendor exposes one.",
                    ],
                    [
                      "recordedAt",
                      "string | null",
                      "ISO 8601 timestamp of the last successful balance read.",
                    ],
                    [
                      "status",
                      "string",
                      "One of: healthy, low, critical, stale, error, nodata.",
                    ],
                    [
                      "burn.perDay",
                      "number | null",
                      "Average credits consumed per day (computed from history).",
                    ],
                    [
                      "burn.daysLeft",
                      "number | null",
                      "Estimated days until the balance hits zero at the current burn rate.",
                    ],
                    [
                      "eta.short",
                      "string",
                      'Punchy burn-out estimate (e.g. "in ~3 days" or "~2 weeks").',
                    ],
                    [
                      "eta.long",
                      "string",
                      'Sentence form (e.g. "Empties in ~12 days.").',
                    ],
                    [
                      "thresholds.low",
                      "number | null",
                      "Balance at which status flips to low. Already resolved: your Warn below number, or the tool default. null when neither is set.",
                    ],
                    [
                      "thresholds.critical",
                      "number | null",
                      "Balance at which status flips to critical. Already resolved the same way. It is a third of the warning number unless it was customised earlier.",
                    ],
                  ].map(([field, type, meaning]) => (
                    <tr key={field}>
                      <td style={TD_STYLE}>
                        <code style={INLINE_CODE}>{field}</code>
                      </td>
                      <td style={{ ...TD_STYLE, color: "var(--ink-3)" }}>
                        <code
                          style={{
                            ...INLINE_CODE,
                            background: "transparent",
                            padding: 0,
                          }}
                        >
                          {type}
                        </code>
                      </td>
                      <td style={{ ...TD_STYLE, color: "var(--ink-2)" }}>
                        {meaning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...PROSE, marginTop: 28 }}>
              <h3 style={{ ...H3_STYLE, marginTop: 0 }}>Example response</h3>
              <pre style={CODE_BLOCK}>{`{
  "pools": [
    {
      "connectionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "connectionName": "Hunter",
      "keyHint": "9f3a",
      "tool": {
        "id": "hunter",
        "name": "Hunter",
        "topupUrl": "https://hunter.io/welcome/upgrade"
      },
      "creditType": "verifications",
      "label": "Verifications",
      "unit": "credits",
      "balance": 620,
      "balanceLimit": 1000,
      "recordedAt": "2026-06-17T08:02:11.000Z",
      "status": "healthy",
      "burn": { "perDay": 52, "daysLeft": 12 },
      "eta": {
        "short": "~2 weeks",
        "long": "Empties in ~12 days."
      },
      "thresholds": { "low": 100, "critical": 33 }
    }
  ]
}`}</pre>

              <h3 style={H3_STYLE}>Error shape</h3>
              <pre
                style={CODE_BLOCK}
              >{`{ "error": { "code": "...", "message": "..." } }`}</pre>
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid var(--hairline)",
                  borderRadius: 8,
                  marginTop: 8,
                }}
              >
                <table style={TABLE_STYLE}>
                  <thead>
                    <tr>
                      <th style={TH_STYLE}>HTTP status</th>
                      <th style={TH_STYLE}>code</th>
                      <th style={TH_STYLE}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POOLS_API_ERRORS.map(({ status, code, when }) => (
                      <tr key={code}>
                        <td style={TD_STYLE}>
                          <code style={INLINE_CODE}>{status}</code>
                        </td>
                        <td style={TD_STYLE}>
                          <code style={INLINE_CODE}>{code}</code>
                        </td>
                        <td style={{ ...TD_STYLE, color: "var(--ink-2)" }}>
                          {when}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={H3_STYLE}>403 insufficient_scope</h3>
              <p>
                The token is real, but it was issued without the{" "}
                <code style={INLINE_CODE}>read</code> scope, which this endpoint
                requires. This is an authorization failure, not an outage, so
                retrying the same token will not help. Every token created in
                Settings → Integrations carries{" "}
                <code style={INLINE_CODE}>read</code>; the connection endpoints
                return the same error for a token without{" "}
                <code style={INLINE_CODE}>write</code>. To fix it, create a new
                token there with the scope you need, swap it into your client,
                and revoke the old one.
              </p>
              <pre style={CODE_BLOCK}>{`HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer error="insufficient_scope"

{
  "error": {
    "code": "insufficient_scope",
    "message": "This token does not have the read scope."
  }
}`}</pre>
            </div>
          </section>

          {/* ── Section 4: Connections (write scope) ── */}
          <section id="connections" style={SECTION_STYLE}>
            <h2 className="f-display" style={H2_STYLE}>
              Connections
            </h2>
            <div style={PROSE}>
              <p>
                Three endpoints manage connections. All of them need a token
                with the <code style={INLINE_CODE}>write</code> scope, share the
                rate limit above, and only ever act on the token owner&apos;s
                account. The Mac app uses them for &ldquo;Move to
                account&rdquo;: it sends the key once, the hosted poller takes
                over, and the pool shows up in{" "}
                <code style={INLINE_CODE}>GET /api/v1/pools</code> like any web
                connection. Thresholds, alert destinations and tokens stay on
                the web.
              </p>

              <h3 style={H3_STYLE}>POST /api/v1/connections</h3>
              <p>
                Adds a connection. The key is checked with one live balance read
                before anything is saved, exactly like the web connect flow; a
                rejected key saves nothing. Returns{" "}
                <code style={INLINE_CODE}>201</code> with the new id. Tags are
                set on the web only; the API does not take them. If you already
                have this tool connected with the same key, it returns{" "}
                <code style={INLINE_CODE}>200</code> with that connection's id
                and <code style={INLINE_CODE}>existing: true</code> instead of
                adding a second one.
              </p>
              <pre
                style={CODE_BLOCK}
              >{`curl -X POST ${appUrl}/api/v1/connections \\
  -H "Authorization: Bearer qc_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "toolId": "hunter", "name": "Hunter", "apiKey": "..." }'

{ "connectionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }`}</pre>
            </div>

            <div
              style={{
                overflowX: "auto",
                marginTop: 16,
                border: "1px solid var(--hairline)",
                borderRadius: 8,
              }}
            >
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Field</th>
                    <th style={TH_STYLE}>Type</th>
                    <th style={TH_STYLE}>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "toolId",
                      "string",
                      "Tool slug, the same id tool.id carries in the pools payload.",
                    ],
                    ["name", "string", "Display name, 80 characters max."],
                    [
                      "apiKey",
                      "string",
                      "The vendor key, for tools with one credential field (most of them).",
                    ],
                    [
                      "credentials",
                      "object",
                      "Instead of apiKey, for tools with several fields: one string per field, keyed by the field name.",
                    ],
                    [
                      "watchedCreditTypes",
                      "string[]",
                      "Optional. Which pools to watch; required when the tool exposes more than one.",
                    ],
                    [
                      "thresholds",
                      "object",
                      "Optional. Warn below per pool, keyed by creditType: { low, critical }, the shape the pools payload returns. critical defaults to a third of low.",
                    ],
                    [
                      "requestId",
                      "string",
                      "Optional UUID. Retrying with the same id returns the connection the first attempt created instead of a duplicate.",
                    ],
                  ].map(([field, type, meaning]) => (
                    <tr key={field}>
                      <td style={TD_STYLE}>
                        <code style={INLINE_CODE}>{field}</code>
                      </td>
                      <td style={TD_STYLE}>
                        <code style={{ ...INLINE_CODE, color: "var(--ink-2)" }}>
                          {type}
                        </code>
                      </td>
                      <td style={{ ...TD_STYLE, color: "var(--ink-2)" }}>
                        {meaning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...PROSE, marginTop: 28 }}>
              <h3 style={{ ...H3_STYLE, marginTop: 0 }}>
                PATCH /api/v1/connections/:id
              </h3>
              <p>
                Send <code style={INLINE_CODE}>apiKey</code> (or{" "}
                <code style={INLINE_CODE}>credentials</code>) to rekey,{" "}
                <code style={INLINE_CODE}>name</code> to rename, or both. A new
                key is checked with the vendor first and a rejected one changes
                nothing. Returns <code style={INLINE_CODE}>200</code> with the
                id.
              </p>
              <pre
                style={CODE_BLOCK}
              >{`curl -X PATCH ${appUrl}/api/v1/connections/<id> \\
  -H "Authorization: Bearer qc_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "apiKey": "..." }'`}</pre>

              <h3 style={H3_STYLE}>DELETE /api/v1/connections/:id</h3>
              <p>
                Removes the connection and its readings. Returns{" "}
                <code style={INLINE_CODE}>204</code> with no body. A connection
                that is not on your account answers{" "}
                <code style={INLINE_CODE}>404</code>, whether or not it exists.
              </p>
              <pre
                style={CODE_BLOCK}
              >{`curl -X DELETE ${appUrl}/api/v1/connections/<id> \\
  -H "Authorization: Bearer qc_live_..."`}</pre>

              <h3 style={H3_STYLE}>Errors</h3>
              <p>
                Same envelope as the pools endpoint. The{" "}
                <code style={INLINE_CODE}>message</code> on a{" "}
                <code style={INLINE_CODE}>422</code> is the vendor check&apos;s
                own wording, the line the web connect dialog would show.
              </p>
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid var(--hairline)",
                  borderRadius: 8,
                  marginTop: 8,
                }}
              >
                <table style={TABLE_STYLE}>
                  <thead>
                    <tr>
                      <th style={TH_STYLE}>HTTP status</th>
                      <th style={TH_STYLE}>code</th>
                      <th style={TH_STYLE}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CONNECTIONS_API_ERRORS.map(({ status, code, when }) => (
                      <tr key={code}>
                        <td style={TD_STYLE}>
                          <code style={INLINE_CODE}>{status}</code>
                        </td>
                        <td style={TD_STYLE}>
                          <code style={INLINE_CODE}>{code}</code>
                        </td>
                        <td style={{ ...TD_STYLE, color: "var(--ink-2)" }}>
                          {when}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ── Section 5: MCP server ── */}
          <section id="mcp" style={SECTION_STYLE}>
            <h2 className="f-display" style={H2_STYLE}>
              MCP server
            </h2>
            <div style={PROSE}>
              <p>
                QuotaCanary runs a remote Streamable HTTP MCP server. Add it to
                Claude or Cursor and your agent can check what&apos;s running
                low before deciding what to do next.
              </p>

              <h3 style={{ ...H3_STYLE, marginTop: 8 }}>Connector URL</h3>
              <pre style={CODE_BLOCK}>{`${appUrl}/mcp`}</pre>

              <p>
                Auth is the same personal access token from Settings →
                Integrations, passed as a bearer token in the connector
                configuration.
              </p>

              <h3 style={H3_STYLE}>Available tools</h3>
            </div>

            <div
              style={{
                overflowX: "auto",
                marginTop: 12,
                border: "1px solid var(--hairline)",
                borderRadius: 8,
              }}
            >
              <table style={TABLE_STYLE}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Tool</th>
                    <th style={TH_STYLE}>What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "list_balances",
                      'Returns all pools. Accepts an optional status filter (same values as the REST API). The morning-brief tool - "what\'s running low and needs topping up?"',
                    ],
                    [
                      "get_tool_balance",
                      "Returns pools for a single tool by name. Useful when an agent already knows which tool it is about to call and wants to check headroom first.",
                    ],
                  ].map(([tool, what]) => (
                    <tr key={tool}>
                      <td style={{ ...TD_STYLE, whiteSpace: "nowrap" }}>
                        <code style={INLINE_CODE}>{tool}</code>
                      </td>
                      <td style={{ ...TD_STYLE, color: "var(--ink-2)" }}>
                        {what}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...PROSE, marginTop: 28 }}>
              <h3 style={{ ...H3_STYLE, marginTop: 0 }}>Add to Claude Code</h3>
              <p>
                One command wires it up, with your token as a bearer header:
              </p>
              <pre
                style={CODE_BLOCK}
              >{`claude mcp add --transport http quotacanary \\
  ${appUrl}/mcp \\
  --header "Authorization: Bearer qc_live_..."`}</pre>

              <h3 style={H3_STYLE}>Add to Cursor</h3>
              <p>
                Add a remote server to your{" "}
                <code style={INLINE_CODE}>mcp.json</code> with an auth header:
              </p>
              <pre style={CODE_BLOCK}>{`{
  "mcpServers": {
    "quotacanary": {
      "url": "${appUrl}/mcp",
      "headers": { "Authorization": "Bearer qc_live_..." }
    }
  }
}`}</pre>

              <h3 style={H3_STYLE}>Add to the Claude desktop app</h3>
              <p>
                The <strong>Add custom connector</strong> dialog only speaks
                OAuth and has no field for a token, so it cannot connect
                QuotaCanary in v1. Bridge it through{" "}
                <code style={INLINE_CODE}>mcp-remote</code> in your{" "}
                <code style={INLINE_CODE}>claude_desktop_config.json</code>{" "}
                instead:
              </p>
              <pre style={CODE_BLOCK}>{`{
  "mcpServers": {
    "quotacanary": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${appUrl}/mcp",
        "--header",
        "Authorization: Bearer qc_live_..."
      ]
    }
  }
}`}</pre>

              <h3 style={H3_STYLE}>Auth note</h3>
              <p>
                Auth is the static <code style={INLINE_CODE}>qc_live_...</code>{" "}
                token from Settings → Integrations, sent as a bearer header. Any
                client that lets you set an{" "}
                <code style={INLINE_CODE}>Authorization</code> header works.
                Connectors that only do full OAuth are not supported in v1.
              </p>

              <h3 style={H3_STYLE}>Try it</h3>
              <p>Once connected, paste this into your agent:</p>
              <pre
                style={{
                  ...CODE_BLOCK,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {`What's running low in my QuotaCanary stack and needs topping up?`}
              </pre>
              <p>
                The agent calls <code style={INLINE_CODE}>list_balances</code>,
                reads the status of every pool, and surfaces whatever needs
                attention. No hardcoded endpoint - the morning brief is
                emergent.
              </p>
            </div>
          </section>

          {/* ── Section 6: Webhooks ── */}
          <section id="webhooks" style={SECTION_STYLE}>
            <h2 className="f-display" style={H2_STYLE}>
              Webhooks
            </h2>
            <div style={PROSE}>
              <p>
                Webhooks are the push side of QuotaCanary. When a watched pool
                crosses a threshold, we POST the alert to every endpoint you
                have set up. Add them under Settings → Integrations → Webhooks -
                a generic HTTPS endpoint or a Slack incoming webhook - and
                choose whether each one fires on low + critical or critical
                only.
              </p>
              <p>
                Delivery is a <code style={INLINE_CODE}>POST</code> with{" "}
                <code style={INLINE_CODE}>content-type: application/json</code>{" "}
                and a{" "}
                <code style={INLINE_CODE}>user-agent: QuotaCanary/1.0</code>{" "}
                header. Generic webhooks also carry an{" "}
                <code style={INLINE_CODE}>idempotency-key</code> - a stable
                per-delivery id you can dedupe on, since retries mean deliveries
                are at-least-once.
              </p>
              <p>A generic webhook receives this JSON body:</p>
              <pre style={CODE_BLOCK}>{`{
  "event": "quota.alert.low",
  "id": "f1e2d3c4-e5f6-7890-abcd-ef1234567890",
  "level": "low",
  "title": "Hunter is running low",
  "body": "Hunter (production) crossed a low threshold.",
  "tool": { "name": "Hunter" },
  "connection": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Hunter (production)"
  },
  "pools": [
    { "label": "Verifications", "balance": 420, "threshold": 500, "unit": "credits" }
  ],
  "dashboard_url": "https://app.quotacanary.com/dashboard",
  "topup_url": "https://hunter.io/welcome/upgrade",
  "created_at": "2026-06-17T09:30:00.000Z"
}`}</pre>
              <p>
                <code style={INLINE_CODE}>event</code> is{" "}
                <code style={INLINE_CODE}>quota.alert.low</code> or{" "}
                <code style={INLINE_CODE}>quota.alert.critical</code>, and{" "}
                <code style={INLINE_CODE}>topup_url</code> is null when we do
                not know the vendor billing page. Slack incoming webhooks get a
                natively formatted message instead of this payload - no setup
                beyond pasting the webhook URL.
              </p>
              <p>
                When a connection stops checking - the vendor rejects its key,
                or three checks in a row fail - we send one alert with{" "}
                <code style={INLINE_CODE}>event</code> set to{" "}
                <code style={INLINE_CODE}>quota.alert.stopped</code> and{" "}
                <code style={INLINE_CODE}>level</code> set to{" "}
                <code style={INLINE_CODE}>critical</code>, so critical-only
                endpoints get it too. Its <code style={INLINE_CODE}>pools</code>{" "}
                is empty and its <code style={INLINE_CODE}>body</code> says why.
                It fires once per incident; the next successful check re-arms
                it.
              </p>
              <p>
                The Send test button in Settings posts the same body with{" "}
                <code style={INLINE_CODE}>event</code> set to{" "}
                <code style={INLINE_CODE}>quota.alert.test</code>. Route on{" "}
                <code style={INLINE_CODE}>event</code> if a test should not page
                anyone.
              </p>

              <h3 style={H3_STYLE}>Verifying the signature</h3>
              <p>
                Every generic webhook gets its own signing secret (
                <code style={INLINE_CODE}>qcwh_...</code>), shown once when you
                add the destination under Settings → Integrations. Each delivery
                is signed with it:
              </p>
              <pre
                style={{
                  ...CODE_BLOCK,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {"quotacanary-signature: t=1780000000,v1=5e1b...c93a"}
              </pre>
              <p>
                <code style={INLINE_CODE}>t</code> is the Unix timestamp in
                seconds and <code style={INLINE_CODE}>v1</code> is the
                hex-encoded HMAC-SHA256 of{" "}
                <code style={INLINE_CODE}>
                  {"<t>"}.{"<raw body>"}
                </code>{" "}
                under your secret. Sign the <strong>bytes you received</strong>,
                not a re-serialized copy of the parsed JSON - key order and
                whitespace both change the digest. We send exactly one{" "}
                <code style={INLINE_CODE}>v1</code> today; parse the elements as
                a list and accept the delivery if any of them matches, so a
                receiver you write now keeps working if that ever changes.
              </p>
              <pre style={CODE_BLOCK}>{`const crypto = require("node:crypto")

const TOLERANCE_SECONDS = 300

function verify(rawBody, header, secret) {
  if (!header) return false

  let timestamp = null
  const signatures = []
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=")
    if (key === "t") timestamp = Number(value)
    if (key === "v1") signatures.push(value)
  }
  if (!timestamp || signatures.length === 0) return false

  // Replay protection: refuse anything outside the clock tolerance.
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) return false

  const expected = crypto
    .createHmac("sha256", secret)
    .update(timestamp + "." + rawBody)
    .digest("hex")

  return signatures.some(
    (s) =>
      /^[0-9a-f]{64}$/.test(s) &&
      crypto.timingSafeEqual(
        Buffer.from(s, "hex"),
        Buffer.from(expected, "hex")
      )
  )
}`}</pre>

              <h3 style={H3_STYLE}>Replay protection</h3>
              <p>
                The timestamp is inside the signed string, so a captured
                delivery cannot be re-sent under a fresh{" "}
                <code style={INLINE_CODE}>t</code> without breaking the digest.
                Reject any delivery whose timestamp is more than{" "}
                <strong>300 seconds</strong> from your own clock, in either
                direction, and compare digests in constant time (
                <code style={INLINE_CODE}>timingSafeEqual</code>, not{" "}
                <code style={INLINE_CODE}>===</code>). Retries reuse the same{" "}
                <code style={INLINE_CODE}>idempotency-key</code>, so dedupe on
                that rather than treating a repeat as an attack.
              </p>

              <h3 style={H3_STYLE}>Rotating a secret</h3>
              <p>
                Settings → Integrations → Webhooks has a{" "}
                <strong>Rotate secret</strong> button on every generic webhook.
                Rotation is immediate and has no overlap window: the old secret
                stops signing the moment you rotate, so update your receiver in
                the same sitting. Webhooks added before signing existed show{" "}
                <strong>Generate secret</strong> instead and keep sending
                unsigned until you press it.
              </p>
            </div>
          </section>

          {/* Bottom CTA */}
          <div
            style={{
              marginTop: 64,
              padding: "28px 32px",
              background: "var(--canary-tint)",
              borderRadius: 12,
              border: "1px solid rgba(255, 196, 0, 0.35)",
            }}
          >
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 16,
                fontWeight: 500,
                color: "var(--ink)",
              }}
            >
              Need a token? Head to Settings → Integrations.
            </p>
            <a
              href={`${appUrl}/settings#integrations`}
              className="btn btn-primary"
            >
              Open Integrations settings
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </article>
      </main>
      <MarketingFooter />
    </>
  )
}
