-- Add Tavily balance support.
-- Tavily exposes account plan credits, optional pay-as-you-go credits, and
-- optional API-key usage caps through its read-only usage endpoint.
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
  'tavily',
  'Tavily',
  '/logos/tavily.png',
  'https://docs.tavily.com/documentation/api-reference/endpoint/usage',
  'Go to app.tavily.com -> API Keys and copy your API key',
  'data',
  'api',
  100,
  true,
  300,
  'https://app.tavily.com/billing',
  '[
    {"credit_type":"plan","label":"Plan Credits","unit":"credits"},
    {"credit_type":"paygo","label":"Pay-as-you-go Credits","unit":"credits"},
    {"credit_type":"key","label":"API Key Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'Search, extraction, crawl, and research APIs for AI agents, billed from API credits.',
  'https://tavily.com'
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
