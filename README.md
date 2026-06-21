# QuotaCanary

The bird that sings before the credits die.

QuotaCanary watches the credit balances across your API tool stack (NeverBounce, MillionVerifier, OpenRouter, Hunter, Prospeo, and ~35 more) and warns you before any of them runs dry. One screen, every balance, no logging into ten dashboards.

## Use it (free, hosted)

The fastest path is the free hosted app. Nothing to install:

**https://quotacanary.com**

That is the recommended way to use QuotaCanary for almost everyone.

## Why this repo exists

QuotaCanary is open source for two reasons:

1. **Audit it.** You are handing a tool your API keys. You should be able to see exactly how they are stored and used. They are encrypted at rest with AES-256-GCM, the key lives in your server environment (not next to the data), and QuotaCanary only ever makes read-only calls. The details, and the honest limits, are in [SECURITY.md](SECURITY.md).
2. **Run your own.** If you would rather not hand your keys to any hosted service, self-host it. Your keys never leave your machine. See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Features

- One dashboard for every credit balance, with green / low / dry status per tool
- Background polling keeps balances fresh
- Burn-rate estimate ("burns out ~Thursday")
- Alerts before a balance hits zero (email optional)
- Manual entry for tools without a balance API
- API keys encrypted at rest (AES-256-GCM); read-only access only
- A small HTTP API + MCP server for your own automations

## Self-hosting in 30 seconds (the gist)

```bash
git clone https://github.com/noamdorr/quotacanary-oss.git quotacanary
cd quotacanary
npm install
cp .env.local.example .env.local   # fill in the values
supabase start                     # local Postgres + Auth in Docker
supabase db reset                  # apply schema + tool catalog
npm run dev
```

Full instructions, including bring-your-own hosted Supabase and deploys to Railway / Fly / Vercel, are in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev)
- [Tailwind CSS 4](https://tailwindcss.com) + shadcn/ui
- [Supabase](https://supabase.com) (Auth, Postgres, RLS)
- Hosted on [Railway](https://railway.app)
- [Biome](https://biomejs.dev) (lint + format), [Vitest](https://vitest.dev) (tests)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adding a tool is three small files.

## License

[MIT](LICENSE)
