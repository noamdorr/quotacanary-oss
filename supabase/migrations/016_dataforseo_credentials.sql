-- DataForSEO is the first supported tool that needs two API credentials
-- instead of one API key. Store the UI field definition on tools, then keep the
-- actual submitted values as one encrypted secret on connections.
alter table public.tools
  add column if not exists credential_fields jsonb;

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
  credential_fields
)
values (
  'dataforseo',
  'DataForSEO',
  '/logos/dataforseo.png',
  'https://docs.dataforseo.com/v3/appendix-user-data/',
  'Go to DataForSEO Dashboard -> API Access and copy your API login and API password',
  'data',
  'api',
  25,
  true,
  75,
  'https://app.dataforseo.com/',
  '[
    {"credit_type":"balance","label":"Account Balance","unit":"usd"}
  ]'::jsonb,
  '[
    {"name":"login","label":"API login","type":"text"},
    {"name":"password","label":"API password","type":"password"}
  ]'::jsonb
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
  credential_fields       = excluded.credential_fields;
