-- 098_treg_balance.sql
-- treg itself as a watched tool: GET /orgs/{org_id}/balance answers a prepaid
-- USD balance. Hand-written adapter because the path takes the integer org id
-- (a slug answers 422), a second value beside the token, so the row sets
-- credential_fields. The token goes in X-Treg-Token, not Bearer.
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
    'treg',
    'treg',
    '/logos/treg.png',
    'https://treg.to/integrate.md',
    'In treg, copy an API token, then run treg org ls for your org ID: the number, not the slug. Checking the balance is free.',
    'data',
    'api',
    5,
    true,
    15,
    'https://treg.to/app',
    '[
      {"credit_type":"balance","label":"Balance","unit":"usd"}
    ]'::jsonb,
    '[
      {"name":"api_token","label":"API token","type":"password"},
      {"name":"org_id","label":"Org ID","type":"text"}
    ]'::jsonb,
    'One token for thousands of SEO, enrichment, social and scraping API tools, billed from a prepaid USD balance.',
    'https://treg.to'
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
