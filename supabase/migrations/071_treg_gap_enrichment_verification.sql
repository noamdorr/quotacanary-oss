-- 071_treg_gap_enrichment_verification.sql
-- First onboarding slice from the treg catalog gap: four enrichment and
-- verification vendors with a documented read-only balance endpoint.
-- BounceBan, Ocean.io and Sixtyfour are catalog entries; PredictLeads is
-- hand-written because it authenticates with an API key plus an API token.
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
    'bounceban',
    'BounceBan',
    '/logos/bounceban.png',
    'https://bounceban.com/public/doc/api.html',
    'Go to BounceBan -> API, copy your API key. Credits are account-wide and do not expire.',
    'email_verification',
    'api',
    250,
    true,
    750,
    'https://bounceban.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Email verification that handles catch-all domains, billed from prepaid credits.',
    'https://bounceban.com'
  ),
  (
    'oceanio',
    'Ocean.io',
    '/logos/oceanio.png',
    'https://app.ocean.io/docs/getCreditBalance',
    'Go to app.ocean.io -> Settings -> API, copy your API token. One-time and recurring credits are reported separately.',
    'email_finding',
    'api',
    50,
    true,
    150,
    'https://www.ocean.io/pricing',
    '[
      {"credit_type":"one_time","label":"One-time credits","unit":"credits"},
      {"credit_type":"recurrent","label":"Recurring credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Lookalike company and contact data for B2B prospecting, billed from standard credits.',
    'https://www.ocean.io'
  ),
  (
    'sixtyfour',
    'Sixtyfour',
    '/logos/sixtyfour.png',
    'https://docs.sixtyfour.ai/api-reference/account/check-balance',
    'Go to app.sixtyfour.ai -> API keys, copy a key. The balance is the organization''s, shared by every key.',
    'email_finding',
    'api',
    5,
    true,
    15,
    'https://sixtyfour.ai/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'AI research agents that enrich people and companies, billed from organization credits.',
    'https://sixtyfour.ai'
  ),
  (
    'predictleads',
    'PredictLeads',
    '/logos/predictleads.png',
    'https://docs.predictleads.com/v3/api_endpoints/api_subscription/get_api_subscription_information',
    'Go to predictleads.com -> Your Subscription Plans, copy both the API key and the API token. The quota resets every month.',
    'data',
    'api',
    10,
    true,
    30,
    'https://predictleads.com/pricing',
    '[
      {"credit_type":"credits","label":"Monthly credits","unit":"credits"}
    ]'::jsonb,
    '[
      {"name":"apiKey","label":"API key","type":"password"},
      {"name":"apiToken","label":"API token","type":"password"}
    ]'::jsonb,
    'Company intelligence signals such as job openings, news and technologies, billed from a monthly credit quota.',
    'https://predictleads.com'
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
