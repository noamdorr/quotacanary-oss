-- 079_sweep_telecom_scraping.sql
-- Balance-endpoint sweep slice A5: one communications platform and three
-- scraping APIs, all catalog entries. Telnyx reads the account balance in
-- dollars; Scrape.do takes its token in the query string (the only documented
-- form) and answers a bad token with 200 and IsActive false.
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
    'telnyx',
    'Telnyx',
    '/logos/telnyx.png',
    'https://developers.telnyx.com/api-reference/billing/get-user-balance-details',
    'In the Telnyx portal, open API Keys and copy a v2 API key (it starts with KEY). The balance shows in US dollars; accounts billed in another currency are not supported yet.',
    'data',
    'api',
    10,
    true,
    30,
    'https://portal.telnyx.com/',
    '[
      {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
    ]'::jsonb,
    null,
    'Communications platform API for SMS, voice and phone numbers, billed from an account balance in dollars.',
    'https://telnyx.com'
  ),
  (
    'scrapedo',
    'Scrape.do',
    '/logos/scrapedo.png',
    'https://scrape.do/documentation/api-response/usage-stats/',
    'In the Scrape.do dashboard, copy your API token. This watches the monthly request allowance on your plan; an inactive subscription reads as a rejected key.',
    'data',
    'api',
    10000,
    true,
    30000,
    'https://scrape.do/pricing/',
    '[
      {"credit_type":"requests","label":"Requests","unit":"credits"}
    ]'::jsonb,
    null,
    'Web scraping API with rotating proxies, billed by monthly successful requests.',
    'https://scrape.do'
  ),
  (
    'hasdata',
    'HasData',
    '/logos/hasdata.png',
    'https://docs.hasdata.com/credits-and-concurrency',
    'In the HasData dashboard, copy your API key.',
    'data',
    'api',
    10000,
    true,
    30000,
    'https://hasdata.com/prices',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Web scraping and SERP data API, billed from a credit balance.',
    'https://hasdata.com'
  ),
  (
    'olostep',
    'Olostep',
    '/logos/olostep.png',
    'https://docs.olostep.com/api-reference/billing/credits-info',
    'In the Olostep dashboard, open API Keys and copy a key. The balance counts every credit you have left, top-ups included.',
    'data',
    'api',
    500,
    true,
    1500,
    'https://www.olostep.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Web scraping and crawling API for AI agents, billed from credits.',
    'https://www.olostep.com'
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
