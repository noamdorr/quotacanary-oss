-- 092_treg_bucket_b_seo_brand_signals.sql
-- treg Bucket B slice B6: an SEO quota, a brand-data API and a company-signals
-- API, all catalog entries. Moz reports its row quota as allotted and used
-- through a JSON-RPC call; Context.dev (formerly Brand.dev) reports credits
-- remaining plus the current period's usage; Akta reports a credit balance.
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
    'moz',
    'Moz',
    '/logos/moz.png',
    'https://moz.com/api/docs/beta/quota-lookup',
    'In your Moz account, open API, then API Keys, and copy a v3 API token. Checking the quota costs no rows.',
    'data',
    'api',
    100,
    true,
    300,
    'https://moz.com/products/api/pricing',
    '[
      {"credit_type":"rows","label":"Rows","unit":"credits"}
    ]'::jsonb,
    null,
    'SEO metrics API for links, domain authority and keywords, billed in rows.',
    'https://moz.com'
  ),
  (
    'contextdev',
    'Context.dev',
    '/logos/contextdev.png',
    'https://docs.context.dev/api-reference/usage/retrieve',
    'In the Context.dev dashboard, create an API key with the logs:read permission (the usage endpoint needs it). Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.context.dev/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Brand, scraping and company data API (formerly Brand.dev), billed from credits.',
    'https://www.context.dev'
  ),
  (
    'akta',
    'Akta',
    '/logos/akta.png',
    'https://docs.akta.pro/docs/developer-tools/cli/commands',
    'In the akta.pro dashboard, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true,
    300,
    'https://docs.akta.pro/getting-started/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Company data and news signals API, billed from credits.',
    'https://akta.pro'
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
