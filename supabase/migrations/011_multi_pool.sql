-- 011_multi_pool.sql
-- Multi-pool balances: a tool can expose multiple quotas (pools); the user
-- chooses which pools to watch, with per-pool thresholds.

-- tools: declared pools so search + the connect modal can show them before a
-- key exists. Null = single implicit pool (no picker; behaves as today).
alter table public.tools
  add column if not exists pools jsonb;

-- connections: which credit_types this connection displays/alerts on
-- (null = watch all returned pools), and per-pool thresholds keyed by
-- credit_type, e.g. {"verifications":{"low":200,"critical":50}}.
alter table public.connections
  add column if not exists watched_credit_types text[],
  add column if not exists pool_thresholds jsonb;

-- Hunter is the first multi-pool tool.
update public.tools
  set pools = '[
    {"credit_type":"searches","label":"Searches","unit":"credits"},
    {"credit_type":"verifications","label":"Verifications","unit":"credits"}
  ]'::jsonb
  where id = 'hunter';
