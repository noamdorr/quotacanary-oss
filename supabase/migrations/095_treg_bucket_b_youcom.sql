-- 095_treg_bucket_b_youcom.sql
-- treg Bucket B slice H2: You.com, a hand-written adapter because the balance
-- route answers in USD cents (fractional) and the catalog has no cents unit.
-- An organization member's key reads the org's shared pool. Coresignal, the
-- other half of the slice, is unsupported by design: it has no balance route,
-- and the only reading is a header on a billed search call, so every poll would
-- spend a credit (see wiki/adapters.md).
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
    'youcom',
    'You.com',
    '/logos/youcom.png',
    'https://you.com/docs/api-reference/billing/get-account-balance',
    'In the You.com platform, open API Keys and copy your key. On an organization key the balance is the shared org pool. Checking it is free.',
    'data',
    'api',
    5,
    true,
    15,
    'https://you.com/platform',
    '[
      {"credit_type":"balance","label":"Balance","unit":"usd"}
    ]'::jsonb,
    null,
    'Web search, contents and research APIs for AI agents, billed from a prepaid USD balance.',
    'https://you.com'
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
