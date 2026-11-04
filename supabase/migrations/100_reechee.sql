-- 100_reechee.sql
-- QUO-426: Reechee as a catalog tool. GET /api/v1/credit-balance answers
-- {"data":{"credits_balance":n}}, a credit count, read with a Bearer rch_live_ key.
insert into public.tools (
  id,
  name,
  logo_url,
  api_docs_url,
  key_instructions,
  category,
  integration_type,
  default_alert_threshold,
  is_active,
  default_low_threshold,
  topup_url,
  pools,
  credential_fields,
  description,
  website_url
)
values
  (
    'reechee',
    'Reechee',
    '/logos/reechee.png',
    'https://reechee.io',
    'In Reechee, open Settings and create an API key (it starts with rch_live_). Copy it when it is shown: it appears once.',
    'data',
    'api',
    100,
    true,
    300,
    'https://app.reechee.io/settings',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Review intelligence for software sales teams, billed from credits spent on unlocks and reports.',
    'https://reechee.io'
  )
on conflict (id) do update set
  name                    = excluded.name,
  logo_url                = excluded.logo_url,
  api_docs_url            = excluded.api_docs_url,
  key_instructions        = excluded.key_instructions,
  category                = excluded.category,
  integration_type        = excluded.integration_type,
  default_alert_threshold = excluded.default_alert_threshold,
  is_active               = excluded.is_active,
  default_low_threshold   = excluded.default_low_threshold,
  topup_url               = excluded.topup_url,
  pools                   = excluded.pools,
  credential_fields       = excluded.credential_fields,
  description             = excluded.description,
  website_url             = excluded.website_url;
