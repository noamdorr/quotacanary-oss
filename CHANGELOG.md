# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and self-host
releases use [semantic versioning](https://semver.org/).

Self-hosters: each release calls out any new environment variable or database
migration under **Upgrade notes**. Always run the migration step after updating.

## [Unreleased]

## [1.0.6] - 2026-07-17

### Fixed
- A stale "running low" alert could fire after the balance had already
  recovered, or after a critical alert had superseded it. Both cancellation
  paths cancel the pending deliveries and close the alert event as two separate
  writes, and both discarded the first write's error: the deliveries stayed
  pending under a closed event, where nothing re-armed them and the delivery
  claim still picked them up and sent them. Cancellation now completes before
  anything can send, and `claim_due_alert_deliveries` skips canceled events
  outright, so a delivery left pending by a failed write, a crash between the
  two writes, or any future caller can no longer be delivered.
- On an install with no email and no webhook configured, a database error while
  advancing a connection's alert level created a **fresh in-app alert on every
  poll** instead of reusing the existing one. The alert event was marked
  satisfied before the level advanced, and a satisfied event cannot be reused,
  so each poll inserted a new one - roughly 96 duplicate in-app alerts a day
  while the error persisted, with every poll still reporting healthy.
- Alert dispatch no longer hides database errors from its writes. Nine writes
  discarded their error entirely; the ones that could not repair themselves on
  the next poll are fixed above, and the rest now report `alertsDegraded` rather
  than reporting a healthy poll while silently failing.
- A permanently failing webhook destination (an HTTP 404, or a URL that no
  longer decrypts) is meant to pause until you edit it. Instead it was retried
  on **every poll, forever**: each failed attempt stamped the destination's
  `updated_at`, which is the column the delivery claim reads to decide whether a
  paused delivery deserves another try. That stamp always landed after the claim
  had recorded the version it was attempting, so the pause re-armed itself on
  the next poll and a dead endpoint was re-POSTed every 15 minutes, with the
  destination's failure count climbing forever. Recording an attempt's health no
  longer touches `updated_at`, so a paused delivery now waits for a real edit,
  and editing the destination still re-arms it.

### Upgrade notes
- **New migration** (`049_claim_skips_canceled_events.sql`). No new environment
  variables. Run the migration step after updating.

## [1.0.5] - 2026-07-16

### Fixed
- A database error during alert dispatch can no longer suppress alerts. Every
  lookup in the dispatch path discarded its error, so "the query failed" and
  "the row isn't there" were indistinguishable, and absence drove decisions
  that don't retry:
  - A failed **destination** lookup was read as "no external channel is
    configured", which satisfied the alert and advanced the connection's
    high-water mark. The connection then never escalated again until its
    balance recovered and dropped a second time. This one bites self-hosted
    installs hardest: without `POSTMARK_SERVER_TOKEN` a webhook is the only
    channel, so there was nothing else left to deliver the warning.
  - A failed **event** lookup was read as "this alert is gone", recording a
    non-retryable pause that only cleared if you edited a destination.
  - A failed lookup during **recovery** skipped the cancellation, letting a
    stale low-balance warning fire against a balance that had already
    recovered.
  Failed lookups now abort the affected step and retry on the next poll. A
  failure to record a delivery result is no longer ignored either; unrecorded
  results are re-sent once the claim lease lapses, so a persistent failure
  meant duplicate alerts.
- The poll response reports `alertsDegraded` when the delivery loop cannot
  run. It previously returned `alertsSent: 0` whether it had nothing to send
  or was completely broken, so an unreachable delivery loop looked healthy.

### Upgrade notes
- No new environment variables and no new migrations. Update the code and
  redeploy.
- Recommended for every install on 1.0.4 or earlier. A single failed query
  could permanently silence a connection's alerts, and nothing surfaced it.
- Watch `alertsDegraded` in the `/api/poll` response. `true` means the delivery
  loop could not run to completion and alerts are not being delivered; the
  server log names the step that failed.

## [1.0.4] - 2026-07-16

### Fixed
- Alert delivery is now retry-safe: a transient email or webhook failure can
  no longer permanently suppress an alert. Deliveries are tracked per channel
  in a new `alert_deliveries` table and retried with capped backoff
  (15m / 1h / 6h / 24h); the connection's alert high-water mark advances only
  after at least one channel actually delivers (or immediately via the in-app
  event when no external channel is configured). Recovery cancels pending
  deliveries so stale warnings can't arrive after a balance is healthy, and a
  critical escalation supersedes pending low-level deliveries. Generic
  webhooks now carry an `Idempotency-Key` header, and Postmark requests get a
  10-second timeout.
- Burn rates and sparklines now cover the last 7 days instead of the newest
  30 raw readings (~7.5 hours at the 15-minute poll cadence). Pools that
  burned credits earlier than that showed "no burn yet" with a flat trend
  line; history is now sampled in the database (newest reading per 6-hour
  bucket) via a new `pool_history_sampled` function.

### Upgrade notes
- Run migrations `047_pool_history_sampled.sql` and
  `048_retry_safe_alert_delivery.sql` (`supabase db push`) before deploying
  this version - the dashboard and API read history through the new sampling
  function, and alert dispatch requires the delivery ledger and its two
  service-role functions.

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

[unreleased]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.6...HEAD
[1.0.6]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.5...v1.0.6
[1.0.5]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/noamdorr/quotacanary-oss/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/noamdorr/quotacanary-oss/releases/tag/v1.0.0
