# Self-Hosting QuotaCanary

The hosted app at https://quotacanary.com is free and is the right choice for almost everyone. Self-host when you would rather your API keys never touch a third-party server. When you self-host, you hold the encryption key and the database; nothing leaves your infrastructure.

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
| `POSTMARK_SERVER_TOKEN` | no | Postmark token for email alerts. Omit it and email is skipped; the dashboard and in-app alerts still work. |
| `NEXT_PUBLIC_MARKETING_URL` | no | Only relevant if you run the marketing surface separately |

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
5. In Supabase Auth settings, set the Site URL and redirect allowlist to your app origin, or email confirmation and password reset links will break.

## Single-domain mode

Set `APP_ONLY=true`. Every request then serves the dashboard app, so you can run on one domain (for example `canary.yourcompany.com`) with no marketing/app host split. Leave it unset only if you intend to serve the marketing site and the app on separate hostnames.

## Keeping balances fresh (the poll cron)

Balances refresh when something calls `POST /api/poll` with your `POLL_SECRET`. Pick one:

```bash
# A plain cron entry (server self-host), every hour:
0 * * * * curl -s -X POST https://your-instance.example.com/api/poll \
  -H "Authorization: Bearer $POLL_SECRET" >/dev/null
```

- **Railway / Fly:** add a scheduled job (Railway Cron, Fly machines schedule) that runs the curl above.
- **Vercel:** add a [Vercel Cron](https://vercel.com/docs/cron-jobs) hitting `/api/poll` (Vercel has no always-on process, so you must use Cron or an external scheduler).
- **Local:** a `crontab` entry pointing at `http://localhost:3000/api/poll` while your machine is on.

## Deploy targets

| Host | Always-on poller | Notes |
| --- | --- | --- |
| Railway | native | Recommended. Persistent Node server; add a Railway Cron for `/api/poll`. |
| Fly.io | native | Container host like Railway; schedule the poll with a Fly cron machine. |
| Vercel | needs Vercel Cron | Serverless; the app runs, but background polling must come from Vercel Cron or an external scheduler. |

Any host that runs `npm run build && npm run start` for a Next.js app works; the only host-specific concern is how you schedule the poll.

## Updating

Self-host from tagged releases, not `master`:

```bash
git fetch --tags
git checkout v1.2.0          # the release you want
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
