# Self-Hosting QuotaCanary

Mac users can build [QuotaCanary for Mac](../mac/docs/BUILDING.md), which keeps vendor keys in the login Keychain and sends them directly to their vendors, never to QuotaCanary servers. If you opt in to update checks, the Mac app sends its app version, macOS version and chip to the signed update feed. Checks and alerts run while the app is running and the Mac is awake and online.

Not on a Mac? Run the web version yourself. You hold the database and encryption key, and you operate the server and polling schedule. This guide is for your own instance, not a QuotaCanary-operated service.

QuotaCanary is a Next.js app backed by Supabase (Postgres + Auth). "Self-host" means running both. You have two ways to get Supabase:

- **Local Supabase in Docker** - fully on your machine, nothing in the cloud. Best for "I trust no one." Polling only runs while your machine and the app are running.
- **Your own hosted Supabase project** - a free Supabase project you control. Best for an always-on instance on a server.

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker (only for the local-Supabase path)

## Environment variables

Copy the example and fill it in:

```bash
cp .env.local.example .env.local
```

| Variable | Required | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (local: `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key (printed by `supabase start`) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key, server-only. Never expose to the client. |
| `ENCRYPTION_KEY` | yes | AES-256 key for encrypting stored API keys. Generate: `openssl rand -base64 32` |
| `POLL_SECRET` | yes | Shared secret guarding the `/api/poll` refresh endpoint |
| `NEXT_PUBLIC_SITE_URL` | yes | Origin used for auth redirects (local: `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_URL` | yes | App origin (single-domain: same as your site URL) |
| `APP_ONLY` | recommended | Set to `true` for a single-domain instance (no marketing/app split) |
| `POSTMARK_SERVER_TOKEN` | no | Postmark token for email alerts. Omit it and email alerts queue instead of sending; the dashboard and in-app alerts still work, and queued alerts go out once you set the token. |
| `FEEDBACK_NOTIFY_EMAIL` | no | Where in-app feedback is emailed. Unset (the default) means no notification is sent - submissions are still stored in your own `feedback_submissions` table, and nothing leaves your instance. |
| `POLL_HEARTBEAT_URL` | no | Ping URL of an external cron monitor (Healthchecks.io and friends). Every poll run pings it, a failed run pings `<url>/fail`, and the ping body carries run counts only. Unset means no ping. |
| `POLL_ALERT_EMAIL` | no | Where a failed poll run is emailed. Needs `POSTMARK_SERVER_TOKEN`. Unset means no mail; `poll_runs` records every run either way. |
| `NEXT_PUBLIC_MARKETING_URL` | no | Only relevant if you run the marketing surface separately |
| `PLAUSIBLE_SCRIPT_SRC` | no | Analytics script URL. Unset by default, and unset means no third-party analytics is loaded. |

Generate the encryption key now and paste it in:

```bash
openssl rand -base64 32
```

## Path A - Local Supabase (air-gapped)

```bash
npm install
supabase start            # boots Postgres + Auth + Studio in Docker
supabase db reset         # applies all migrations + seeds the tool catalog
```

`supabase start` prints your local `API URL`, `anon key`, and `service_role key`. Put those into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Set `APP_ONLY=true`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`. Then:

```bash
npm run dev
```

Open http://localhost:3000, sign up (email confirmation is off locally), and add your tools. Your keys are encrypted with your `ENCRYPTION_KEY` and stored only in your local Postgres.

## Path B - Your own hosted Supabase project

1. Create a free project at https://supabase.com.
2. Link the CLI and push the schema:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push        # applies supabase/migrations to your project
   ```

3. Seed the tool catalog (one time):

   ```bash
   psql "<your-project-connection-string>" -f supabase/seed.sql
   ```

4. From the Supabase dashboard (Project Settings -> API), copy the project URL, anon key, and service-role key into `.env.local`.
5. In Supabase Auth settings, set the Site URL and redirect allowlist to your app origin, or the magic-link sign-in and email confirmation links will break.

## Single-domain mode

Set `APP_ONLY=true`. Every request then serves the dashboard app, so you can run on one domain (for example `canary.yourcompany.com`) with no marketing/app host split. Leave it unset only if you intend to serve the marketing site and the app on separate hostnames.

## Keeping balances fresh (the poll cron)

Balances refresh when something calls `POST /api/poll` with your `POLL_SECRET`.
Use one scheduler every 15 minutes. The app's missed-run counter assumes this
interval; an hourly schedule produces misleading missed-run warnings.

### Keep the secret out of the command

Run setup as the account that will run cron. Create a private curl config outside
the checkout, then edit it locally (or mount an equivalent file from your secret
manager). Do not paste the real secret into a terminal command or crontab.

```bash
umask 077
mkdir -p "$HOME/.config/quotacanary" "$HOME/.local/bin"
touch "$HOME/.config/quotacanary/poll.curl"
chmod 700 "$HOME/.config/quotacanary"
chmod 600 "$HOME/.config/quotacanary/poll.curl"
```

Put these two lines in `~/.config/quotacanary/poll.curl`, replacing the placeholders
in your editor. Use the app's direct HTTPS origin, without redirects. For a local
instance only, use `http://127.0.0.1:3000/api/poll` with `APP_ONLY=true`.

```text
url = "https://your-instance.example.com/api/poll"
header = "Authorization: Bearer REPLACE_WITH_YOUR_POLL_SECRET"
```

Keep this file and editor backups private. Curl reads the header from the file,
so the secret is absent from process arguments and shell history. Do not enable
shell tracing (`set -x`), curl verbose/trace output, or request-header logging.

### Install and schedule the command

Save the following as `~/.local/bin/quotacanary-poll`:

```sh
#!/bin/sh
set -eu
poll_config="${1:-$HOME/.config/quotacanary/poll.curl}"
poll_exit=0
poll_http=$(curl -q --config "$poll_config" \
  --request POST --fail --silent --output /dev/null \
  --write-out '%{http_code}' --connect-timeout 10 --max-time 300 \
  --retry 0 2>/dev/null) || poll_exit=$?
case "$poll_exit:$poll_http" in
  0:2[0-9][0-9]) exit 0 ;;
esac
printf 'QuotaCanary poll failed: curl exit %s, HTTP %s\n' \
  "$poll_exit" "${poll_http:-000}" >&2
exit 1
```

This exits nonzero for HTTP errors, redirects, and transport failures. It keeps
only the HTTP status and curl exit code in stderr; raw response bodies, URLs,
headers, and curl diagnostics are discarded because an upstream error page can
contain sensitive data. `-q` prevents a personal `.curlrc` from enabling tracing
or changing the request. See the [curl options reference](https://curl.se/docs/manpage.html).

Make it executable, then run it once while watching your app logs:

```bash
chmod 700 "$HOME/.local/bin/quotacanary-poll"
"$HOME/.local/bin/quotacanary-poll"
```

For plain cron, add this **single line** with `crontab -e` as the same account:

```cron
*/15 * * * * "$HOME/.local/bin/quotacanary-poll"
```

Keep stderr available to cron mail or your scheduler's failure notifications;
a nonzero exit alone does not notify anyone. The external monitor below also
catches a scheduler that never starts. Container jobs can pass a mounted config
path as the script's first argument, for example `/run/secrets/poll.curl`.

- **Timeout:** 10 seconds to connect, 300 seconds for the whole client request.
  Your host may terminate the server earlier. Curl exit 28 means a client timeout;
  22 with HTTP 401 means the bearer secret was rejected; HTTP 500 means the poll
  or its infrastructure failed. HTTP 000 means no HTTP status was received.
- **Retries:** none, including at the scheduler level. A failed or timed-out POST
  may already have refreshed balances or sent alerts. Inspect app logs and run
  history before a manual retry; do not add `--retry-all-errors`.
- **Overlap:** keep exactly one scheduler and no concurrent manual runs. There
  is no global poll lock. Where supported, disable concurrent job execution. A
  client timeout does not cancel server work, so inspect a timed-out run before
  starting another. A local job lock cannot coordinate multiple machines.

**Where to schedule:** Fly.io or another job runner can execute the script;
local cron only works while your machine and app are running. For an app hosted
on Vercel, use an external runner that can make this authenticated POST.
[Vercel Cron sends GET requests](https://vercel.com/docs/cron-jobs#how-cron-jobs-work),
so pointing it directly at this POST-only endpoint will not work.

### Know when polling stops

Configure these on the **app server**, not the cron runner:

- Set `POLL_HEARTBEAT_URL` to a private ping URL from an external cron monitor
  that supports POST pings and a `/fail` suffix. Configure a 15-minute expected
  interval, a 10-minute grace period, and a notification destination you check.
  Completed failed runs ping `/fail`; missing pings catch a stopped scheduler,
  rejected credentials, or an unavailable app/database. Keep the ping URL private.
- Optionally set `POLL_ALERT_EMAIL` and `POSTMARK_SERVER_TOKEN` for an email with
  run counts on failure, missed runs, or repeated degradation. Email alone cannot
  report an app that is down. Both monitoring features are off when unset.

HTTP 200 can still mean `degraded`: some refreshes or alert sends failed. Degraded
runs deliberately send a success heartbeat because the scheduler is alive.
Inspect persistent degradation in app logs (`[poll] run degraded`) or the recent
run history in your own database:

```sql
select started_at, finished_at, outcome, refresh_failed, alerts_failed,
       alerts_degraded, missed_runs
from public.poll_runs
order by started_at desc
limit 20;
```

Verify that one scheduled run records a recent row and reaches your monitor.
Then test the monitor's notification path; do not assume a configured destination
has delivered an alert. After changing the secret, update both the app and the
private curl config, and verify the next run again.

## Deploy targets

| Host | Always-on poller | Notes |
| --- | --- | --- |
| Fly.io | native | Container host; schedule the poll with a Fly cron machine. |
| Vercel | external POST runner | Schedule the authenticated POST externally; native Vercel Cron uses GET. |

Any host that runs `npm run build && npm run start` for a Next.js app works; the only host-specific concern is how you schedule the poll.

## Updating

Self-host from tagged releases, not `master`:

```bash
git fetch --tags
git checkout v1.0.2          # the release you want
npm install
supabase db push            # or `supabase db reset` for the local path
npm run build && npm run start
```

Every release notes any new env var or migration in [CHANGELOG.md](../CHANGELOG.md). Always run the migration step after updating.

## Troubleshooting

- **"ENCRYPTION_KEY must decode to 32 bytes"** - your key is not a base64-encoded 32-byte value. Regenerate with `openssl rand -base64 32`.
- **Auth emails / confirmation links break** - your Supabase Auth Site URL or redirect allowlist does not include your app origin.
- **Balances never update** - your poll cron is not calling `/api/poll`, or the `POLL_SECRET` header does not match.
- **Landing on a marketing page instead of the dashboard** - set `APP_ONLY=true`.
