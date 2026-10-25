-- Add Crawlbase product credit balance support.
-- Crawlbase exposes remaining monthly credits through its read-only Account API.
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
  'crawlbase',
  'Crawlbase',
  '/logos/crawlbase.png',
  'https://crawlbase.com/docs/account-api',
  'For subscription products only. Go to Crawlbase -> Tokens, copy your token, and enter one product slug: crawling-api, crawler, smartproxy, scraper-api, leads-api, or screenshot-api. Allow five minutes between checks.',
  'data',
  'api',
  250,
  true,
  750,
  'https://crawlbase.com/pricing',
  '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb,
  '[
    {"name":"token","label":"Token","type":"password"},
    {"name":"product","label":"Product slug","type":"text","placeholder":"crawling-api"}
  ]'::jsonb,
  'Crawling and scraping APIs with remaining monthly credits for subscription products.',
  'https://crawlbase.com'
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
