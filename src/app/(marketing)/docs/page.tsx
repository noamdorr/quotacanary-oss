import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { APP_URL } from "@/components/marketing/constants"
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
      <MarketingNav />
      <main>
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
            QuotaCanary exposes a read-only REST API and a remote MCP server.
            Your balances, surfaced wherever you already work.
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
                Everything here is{" "}
                <strong>read-only and scoped to your account.</strong> The API
                and MCP server can fetch your credit-pool data and nothing else.
                They cannot connect tools, modify thresholds, or touch any
                account in any connected service.
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
                  <strong>REST API</strong> - a single JSON endpoint at{" "}
                  <code style={INLINE_CODE}>{appUrl}/api/v1/pools</code>. Good
                  for scripts, dashboards, and any HTTP client.
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

              <h3 style={H3_STYLE}>Rate limit</h3>
              <p>
                60 requests per minute per token. Exceed that and you get a{" "}
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
                <code style={INLINE_CODE}>disconnected</code>,{" "}
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
                      "One of: healthy, low, critical, stale, error, disconnected, nodata.",
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
                      'Punchy burn-out estimate (e.g. "burns out Friday" or "~2 weeks").',
                    ],
                    [
                      "eta.long",
                      "string",
                      'Sentence form (e.g. "Empties in ~12 days.").',
                    ],
                    [
                      "thresholds.low",
                      "number | null",
                      "Balance at which status flips to low. null = default.",
                    ],
                    [
                      "thresholds.critical",
                      "number | null",
                      "Balance at which status flips to critical. null = default.",
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
      "tool": {
        "id": "hunter",
        "name": "Hunter",
        "topupUrl": "https://hunter.io/billing"
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
      "thresholds": { "low": 100, "critical": 10 }
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
                    {[
                      ["401", "unauthorized", "Missing or invalid token."],
                      [
                        "400",
                        "invalid_status",
                        "?status= contains an unrecognized value.",
                      ],
                      ["429", "rate_limited", "Over 60 requests per minute."],
                      ["500", "internal", "Something went wrong on our end."],
                    ].map(([status, code, when]) => (
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

          {/* ── Section 4: MCP server ── */}
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

          {/* ── Section 5: Webhooks ── */}
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
                header. There is no signature header - the endpoint URL is the
                secret, so keep it private.
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
  "topup_url": "https://hunter.io/billing",
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
