-- Add Scale SERP account credit balance support.
-- Scale SERP exposes remaining monthly search credits through a read-only
-- account endpoint.
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
values (
  'scaleserp',
  'Scale SERP',
  '/logos/scaleserp.png',
  'https://docs.trajectdata.com/scaleserp/account-api',
  'Go to app.scaleserp.com -> Dashboard -> copy your API key',
  'data',
  'api',
  250,
  true,
  750,
  'https://trajectdata.com/serp/scale-serp-api/pricing/',
  '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'High-scale Google SERP data API, billed from monthly search credits.',
  'https://trajectdata.com/serp/scale-serp-api/'
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
