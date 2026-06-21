# Contributing to QuotaCanary

Thanks for helping. This repo is a public mirror of the app that powers https://quotacanary.com. Issues and pull requests are welcome; maintainers review PRs here and land them into the canonical app.

## Local setup

```bash
npm install
cp .env.local.example .env.local   # fill in the values
supabase start                     # local Postgres + Auth in Docker
supabase db reset                  # apply all migrations + seed the tool catalog
npm run dev
```

Full environment details are in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Code style

Biome handles lint and formatting. Run this before committing:

```bash
npm run check
```

Key rules: double quotes, no semicolons, trailing commas (ES5), 2-space indent.

## Adding a tool

A new tool is three small changes:

1. **Adapter** - create `src/lib/adapters/<tool>.ts` implementing the adapter interface (`readBalance`, and the metadata the registry expects). Copy the closest existing adapter in `src/lib/adapters/` as a template.
2. **Registry** - register the adapter in `src/lib/adapters/registry.ts`.
3. **Seed** - add the tool definition (name, logo, credit pools) to `supabase/seed.sql`, and add a migration under `supabase/migrations/` if the catalog needs a new row in a deployed database.

Add a test next to the adapter (see the existing `*.test.ts` files for the mocking pattern).

## Pull requests

- Keep PRs focused on a single change.
- Include a clear description of what and why.
- Ensure `npm run build`, `npm run check`, and `npm test` all pass.

## Tests

```bash
npm test          # run once
npm run test:watch
```
