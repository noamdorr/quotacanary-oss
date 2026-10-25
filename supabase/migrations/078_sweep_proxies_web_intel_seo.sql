-- 078_sweep_proxies_web_intel_seo.sql
-- Balance-endpoint sweep slice A4: a residential proxy vendor, two web and IP
-- intelligence APIs and one SEO suite. IPRoyal, Similarweb and IPinfo are
-- catalog entries; Mangools is hand-written, because its limits endpoint
-- answers a bad token with 200 and zero everywhere. IPRoyal reads residential
-- traffic only, in GB.
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
    'iproyal',
    'IPRoyal',
    '/logos/iproyal.png',
    'https://docs.iproyal.com/proxies/residential/api/user',
    'In the IPRoyal dashboard, open Settings and copy the token from the API section. Only residential traffic shows here; datacenter, ISP and mobile proxies are not supported yet.',
    'data',
    'api',
    1,
    true,
    3,
    'https://iproyal.com/residential-proxies/',
    '[
      {"credit_type":"traffic","label":"Residential traffic","unit":"gb"}
    ]'::jsonb,
    null,
    'Residential proxy network, billed by the GB of traffic.',
    'https://iproyal.com'
  ),
  (
    'similarweb',
    'Similarweb',
    '/logos/similarweb.png',
    'https://developers.similarweb.com/docs/check-capabilities',
    'In Similarweb, open the API section of your account settings and copy your API key. The REST API is a paid add-on, so the key needs an API subscription.',
    'data',
    'api',
    5000,
    true,
    15000,
    'https://www.similarweb.com/corp/pricing/',
    '[
      {"credit_type":"data_credits","label":"Data credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Website and app traffic intelligence API, billed from data credits.',
    'https://www.similarweb.com'
  ),
  (
    'ipinfo',
    'IPinfo',
    '/logos/ipinfo.png',
    'https://ipinfo.io/developers',
    'In the IPinfo dashboard, copy your access token. This watches the monthly request allowance on your plan.',
    'data',
    'api',
    2500,
    true,
    7500,
    'https://ipinfo.io/pricing',
    '[
      {"credit_type":"requests","label":"Requests","unit":"credits"}
    ]'::jsonb,
    null,
    'IP geolocation and network data API, billed by monthly requests.',
    'https://ipinfo.io'
  ),
  (
    'mangools',
    'Mangools',
    '/logos/mangools.png',
    'https://mangools.com/api',
    'In your Mangools account, open the API page and copy your access token. Keyword lookups, SERP lookups and backlink rows show as separate balances.',
    'data',
    'api',
    25,
    true,
    75,
    'https://mangools.com/plans-and-pricing',
    '[
      {"credit_type":"keyword_lookups","label":"Keyword lookups","unit":"credits"},
      {"credit_type":"serp_lookups","label":"SERP lookups","unit":"credits"},
      {"credit_type":"backlink_rows","label":"Backlink rows","unit":"credits"}
    ]'::jsonb,
    null,
    'SEO suite (KWFinder, SERPChecker, LinkMiner) with an API, billed from daily lookups and monthly backlink rows.',
    'https://mangools.com'
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
