# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and self-host
releases use [semantic versioning](https://semver.org/).

Self-hosters: each release calls out any new environment variable or database
migration under **Upgrade notes**. Always run the migration step after updating.

## [Unreleased]

## [1.0.3] - 2026-07-15

### Added
- BuiltWith and Keywords Everywhere balance adapters. Migrations 040 and 041
  add both tools to the catalog.
- The canary grew up: idle blinks, an occasional tail flick, an open beak and
  floating notes while singing, a wide-eyed alert pose, and X-eyed keel-over
  when a pool is empty. The dashboard hero bird now reacts to your stack's
  state - quiet when everything is healthy, singing while a warning is live.
  All of it sits still under `prefers-reduced-motion`.
- The mascot now greets you in app onboarding, on the connect success step,
  and in the empty dashboard.
- A few easter eggs for the curious: check the browser console, poke the
  homepage bird a few times, and read `/humans.txt`.

### Changed
- Dashboard polish: sparklines draw in on load, critical status dots pulse
  gently, and the connection drawer shows the pool's status pill with a
  status-colored sparkline (it was always grey before).
- Connect flow polish: the tool picker is warmer and more scannable, the
  credential form explains the read-only check more clearly, and the pending
  balance check has a small reduced-motion-safe listening cue. First-tool
  onboarding uses the same listening cue now, with a tiny alert bird watching
  the read-only check.
- The alerts page explains threshold alerts once above the list instead of
  repeating the same sentence under every connection.

### Security
- Every user mutation now carries an explicit owner filter on top of row-level
  security (defense in depth), and the service-role admin/crypto modules fail
  the build if a client bundle ever imports them.
- Host routing hardening: a spoofed `app.<something>quotacanary.com` host no
  longer classifies as the app surface, an app path requested on a raw-IP host
  redirects instead of crashing the middleware, and the email-confirm redirect
  rejects backslash paths that browsers would normalize into an open redirect.
- Alert emails escape all interpolated fields in the HTML part, and Slack
  alert payloads escape interpolated text at the mrkdwn boundary (a connection
  name could otherwise inject Slack formatting or links).
- API token scopes are now enforced: the REST API returns 403
  `insufficient_scope` and the MCP server rejects at the auth boundary when a
  token lacks the read scope. The Bearer scheme matches case-insensitively
  per RFC 7235, and token-lookup database errors are logged instead of being
  silently swallowed (auth still fails closed).
- Connect and request-a-tool inputs carry length caps, and watched credit
  pools are validated against the tool's declared pools.
- The poll route no longer returns raw database error details to the caller,
  and the email client no longer logs the Postmark response body (it echoes
  the recipient address).
- Alert destination display hints now store only the host, never secret-bearing
  webhook paths, credentials, query strings, or fragments. Migration 044
  redacts existing hints and enforces host-only values while the full
  destination URL remains encrypted.
- The retired v1 rate-limit RPC is no longer executable by `anon` or
  `authenticated`. Migration 045 reserves it for `service_role` only.

### Fixed
- Server action failures now surface in the UI everywhere (destination
  toggle/remove, mark-alert-read, alert on/off, notify mode, and the tools-page
  rename/refresh/update-key/remove) instead of being silently swallowed.
- Threshold inputs reject non-numeric and negative values instead of silently
  saving them as cleared.
- `GET /api/v1/pools` sends `RateLimit-Limit`, `RateLimit-Remaining`, and
  `RateLimit-Reset` on successful responses too, and `RateLimit-Reset` /
  `Retry-After` now report the real seconds until the window resets
  (migration 042 adds the state-returning limiter function).
- The tools page shows the same stale-adjusted connection status as the
  dashboard (a dead connection no longer reads "Active" there), and tools-page
  mutations refresh that page instead of leaving it stale.
- The dashboard row's "Get more" link is no longer nested inside the row
  button (invalid interactive nesting; keyboard and screen-reader fix).
- Marketing: skip-to-content links on the docs, privacy, and terms pages; the
  self-hosting guide's update example points at a real release tag.
- Hunter's "Get more" link now points to its current upgrade page. Migration
  043 updates existing tool catalogs.
- Dev: client components on the marketing surface hydrate again when
  previewing via `127.0.0.1` (Next 16 rejected the HMR websocket from that
  origin, which stalled hydration; `allowedDevOrigins` now covers it).

### Removed
- The Settings "Display" section. It saved a flat-vs-grouped preference that no
  screen ever read; the `users.display_mode` column stays in the schema.
- The dead `disconnected` value from the API status filter. The app never
  writes that status; filtering on it now returns 400.

### Upgrade notes
- No new environment variables.
- Six new database migrations (040-045). Run `supabase db push` (hosted
  Supabase) after pulling, or `supabase db reset` for a clean local stack
  (wipes local data):
  - 040 and 041 add BuiltWith and Keywords Everywhere to the tool catalog.
  - 042 adds `consume_api_rate_limit_v2` for accurate rate-limit headers.
  - 043 updates Hunter's top-up URL in existing catalogs.
  - 044 redacts legacy alert destination hints and enforces host-only values.
  - 045 revokes public, `anon`, and `authenticated` execution of the retired
    v1 rate-limit RPC while retaining `service_role` access.

## [1.0.2] - 2026-07-05

### Security
- Send security headers on every route: HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, and a `frame-ancestors 'none'` CSP.
- Allowlist the `/login` notice params. Unknown or malformed values fall back to
  generic copy instead of crashing the page or echoing attacker-supplied text.
- Block IPv4-mapped IPv6 addresses in the alert webhook SSRF guard.

### Added
- Branded 404 and error pages.
- Balance history retention: each poll run prunes readings older than 90 days,
  always keeping the newest 50 per pool so sparklines and burn rates survive.

### Fixed
- Fresh installs now grant table privileges to all three Supabase roles:
  `authenticated` (migration 036) plus `anon` and `service_role` (039). Without
  them a clean self-host could sign up, but polling failed with `permission
  denied for table connections`. Hosted Supabase masks the gap with platform
  default privileges, which is why it went unnoticed.
- Vendor adapter requests now time out instead of hanging, and a response that
  is missing the balance field counts as an error, not a zero balance.
- Poll runs isolate per-connection failures and run with bounded concurrency,
  so one slow or broken vendor cannot fail the whole run. Alert webhook
  delivery gets a 10 second timeout.
- Seed parity for fresh installs: catalog backfills from migrations 009, 034,
  and 035 (topup URLs, default low thresholds) are mirrored in `seed.sql`, and
  four multi-pool tools (emaillistverify, reoon, surfe, valueserp) now declare
  their pools (037).
- Middleware redirects now carry the refreshed Supabase auth cookies, per the
  `@supabase/ssr` contract.
- Marketing site: og:image on the homepage and per-tool directory pages,
  `/docs` in the sitemap, apple-touch-icon.

### Upgrade notes
- No new environment variables.
- Four new database migrations (036-039). Run `supabase db push` (hosted
  Supabase) or `supabase db reset` (local stack; wipes data) after pulling.
  036 and 039 are required: fresh installs cannot poll without them.
- Balance readings older than 90 days are now pruned automatically (the newest
  50 per pool are always kept).

## [1.0.1] - 2026-06-22

### Security
- Harden alert webhook delivery against SSRF: destination URLs are re-validated at
  delivery time, hosts resolving to private/loopback/link-local/cloud-metadata
  addresses are blocked, and redirects are no longer followed.
- Send connected-tool API keys via a request header instead of a URL query string
  wherever the vendor supports it, so keys stop leaking into vendor logs and proxies.
- Patch dependency advisories (Next.js 16.1.6 -> 16.2.9 plus transitive fixes).

### Fixed
- Enforce the signed-in route boundary across the whole dashboard area in
  middleware, not just `/dashboard`.

### Upgrade notes
- No new environment variables or database migrations. Pull and rebuild.

## [1.0.0] - 2026-06-21

### Added
- Open-source release: public mirror, self-hosting guide, security disclosure.
- `APP_ONLY` flag for single-domain self-host instances.
- `supabase/config.toml` for a one-command local Supabase stack.

### Upgrade notes
- New optional env var `APP_ONLY` (set `true` for single-domain self-host).
- Run `supabase db push` (hosted) or `supabase db reset` (local) after pulling.

[unreleased]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.3...HEAD
[1.0.3]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/noamdorr/quotacanary-oss/releases/tag/v1.0.0
