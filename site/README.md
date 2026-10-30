# QuotaCanary marketing site

The public site at quotacanary.com: a static [Astro](https://astro.build) build served by a small Node server. The Mac app lives in `../mac/`; the Next.js source one directory up is the self-host web option. This project renders marketing and directory pages. `/docs` redirects to `/`; API/MCP instructions remain in the self-host source.

```bash
npm ci
npm run build          # prerenders every page into dist/
npm test               # contract tests against dist/ (headers, redirects, 404, sitemap)
SITE_DEV=1 CANONICAL_HOST= npm start   # http://localhost:4321
```

- `server.mjs` serves `dist/`, sets the security headers (CSP without inline scripts), redirects `www` to the apex (`CANONICAL_HOST`, default `quotacanary.com`; set it empty to disable) and answers `/healthz`.
- `PLAUSIBLE_SCRIPT_SRC` (optional) turns on analytics: the build emits the script tag and the server admits its origin in the CSP. Unset means no third-party script at all.
- `src/data/tools.json` is the tool catalog the directory pages are built from. It holds exactly the tools the Mac app supports (`test/mac-parity.test.mjs` fails otherwise). To refresh it after a tool lands in `mac/` and `supabase/migrations/`:

  ```bash
  supabase db reset        # from the repo root, with `supabase start` running: applies migrations + seed
  npm run tools:pull       # from site/: reads the tools table with psql, writes tools.json, copies new logos
  ```

  `tools:pull` reads `DB_URL` (default: the local stack's Postgres on `127.0.0.1:54322`), so any Postgres with the migrations applied works. It writes only ids the Mac app supports and fails if one has no catalog row. Existing `key_instructions` text is kept; a new tool takes its hint from `mac/Sources/QuotaCanaryCore/Copy.swift` (`keyRequirements`) or stays empty. Needs `psql` on the PATH.
- Changed copy for P-QUO-42 is an unapproved review specimen; numbered alternatives are in the integration PR. Noam must pick before merge.
- `src/lib/copy.ts` holds the page copy; `src/styles/impeccable.css` is the design system, `site.css` the additions.
