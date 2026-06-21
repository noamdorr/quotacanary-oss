-- Add Semrush balance support.
-- Semrush exposes remaining Standard API units through a read-only CSV
-- balance endpoint.
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
  'semrush',
  'Semrush',
  '/logos/semrush.png',
  'https://developer.semrush.com/api/get-started/api-units-balance/',
  'Go to Semrush -> Subscription info -> API units and copy your API key',
  'data',
  'api',
  1000,
  true,
  3000,
  'https://www.semrush.com/billing-admin/profile/subscription/api-units',
  '[
    {"credit_type":"units","label":"API Units","unit":"credits"}
  ]'::jsonb,
  null,
  'SEO and competitive intelligence APIs, billed from API units.',
  'https://www.semrush.com'
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
