-- Add Keywords Everywhere account credit balance support.
-- Keywords Everywhere exposes the remaining account credit balance through a
-- read-only account endpoint.
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
  'keywordseverywhere',
  'Keywords Everywhere',
  '/logos/keywordseverywhere.png',
  'https://api.keywordseverywhere.com/docs/#/miscellaneous/get_credits',
  'Go to Keywords Everywhere -> API key and copy your API key',
  'data',
  'api',
  1000,
  true,
  3000,
  'https://keywordseverywhere.com/pricing.html',
  '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'SEO keyword, traffic, and backlink data APIs, billed from account credits.',
  'https://keywordseverywhere.com'
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
