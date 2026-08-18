# Browser smoke tests

Playwright coverage for the journey that unit tests cannot reach: the proxy's
hostname split, Supabase Auth redirects, server actions, and the dashboard's
one-row-per-pool rendering.

## Running them

```bash
supabase start          # the suite talks to the local stack, not a remote
npm run build
npm run test:e2e        # everything
npm run test:e2e:smoke  # the @smoke subset, which is what CI runs
```

Playwright starts `npm run start` itself and reuses an already-running server
outside CI. Values come from `.env.local`; `e2e/fixtures/stack.ts` loads that
file because, unlike Next, the Playwright process does not read it on its own.
`E2E_MOCK_TOOL=true` has to be among them.

## How it stays deterministic

Every adapter in `src/lib/adapters/` calls a live vendor, and creating a
connection performs a real balance read, so the suite would otherwise need a
paid API key. Instead:

- `src/lib/adapters/e2e-mock.ts` answers from the key itself:
  `qc_e2e_<primary>_<secondary>` reads back those two balances, and anything
  else is rejected. `getAdapter` only returns it when `E2E_MOCK_TOOL=true`, so
  the tool id resolves to nothing anywhere else. `e2e-mock.test.ts` pins that.
- Its catalog row is inserted by the fixtures, not by `seed.sql`, so the fake
  tool exists only in a database a test just reset.
- Each test gets a unique address and deletes the account afterwards. That
  cascades through `public.users` to its connections and balances.
- Sign-in is the real journey: the form posts, GoTrue sends the mail, the test
  reads it out of Mailpit (`:54324`) and follows the link. No session is
  injected.

Two things the suite deliberately does not do: reach any external host (the
webhook specs point at the reserved `.invalid` TLD, which cannot resolve), and
set `APP_ONLY`, because that flag collapses the marketing/app split the routing
spec exists to check.

## Selector notes

- The dashboard renders the table **and** card layouts into the DOM and picks
  one with a CSS breakpoint, so most labels match twice. Filter to the visible
  copy. Only table rows carry `aria-label="Open <name> details"`, which makes
  that the reliable way to count pool rows.
- There are no `data-testid` attributes in this codebase and these tests do not
  add any; the convention is role plus accessible name.
- Onboarding's tool chips are a curated featured list that the fixture tool is
  not part of, and every real tool there needs a live vendor key. Connection
  creation is therefore covered through `/connect`.
