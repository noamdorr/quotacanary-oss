-- Add Ahrefs balance support. Ahrefs exposes monthly API unit limits and usage
-- through a free subscription-info endpoint.
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
  'ahrefs',
  'Ahrefs',
  '/logos/ahrefs.png',
  'https://docs.ahrefs.com/en/api/reference/subscription-info/get-limits-and-usage',
  'Go to Ahrefs -> Account settings -> API and copy your API key',
  'data',
  'api',
  5000,
  true,
  15000,
  'https://app.ahrefs.com/account/subscription',
  '[
    {"credit_type":"units","label":"API Units","unit":"credits"}
  ]'::jsonb,
  null,
  'SEO data and backlink intelligence APIs, billed from monthly API units.',
  'https://ahrefs.com'
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
