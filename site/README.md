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
- `src/data/tools.json` is the tool catalog the directory pages are built from; `npm run tools:pull` refreshes it from a QuotaCanary database (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
- Changed copy for P-QUO-42 is an unapproved review specimen; numbered alternatives are in the integration PR. Noam must pick before merge.
- `src/lib/copy.ts` holds the page copy; `src/styles/impeccable.css` is the design system, `site.css` the additions.
