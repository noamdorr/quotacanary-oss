-- 096_treg_mac_gap_docs_firm.sql
-- QUO-340: eight docs-firm balance reads from the 2026-10-28 treg vs Mac
-- inventory (wiki/raw/2026-10-28-treg-mac-gap-inventory.md), all catalog
-- entries. EODHD reports a daily pool plus bought extra calls; X reports its
-- Post read cap (the prepaid USD balance has no API); Arihaan Jobs reads a
-- monthly plan's daily token limit.
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
    'influencersclub',
    'Influencers Club',
    '/logos/influencersclub.png',
    'https://docs.influencers.club/openapi/account-credits-and-usage/account_credits_usage_retrieve',
    'In the Influencers Club dashboard, open API and copy your key. Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true,
    300,
    'https://influencers.club/pricing/',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Creator and influencer discovery and enrichment API, billed from credits.',
    'https://influencers.club'
  ),
  (
    'spidercloud',
    'Spider',
    '/logos/spidercloud.png',
    'https://spider.cloud/docs/api',
    'In the Spider dashboard, open API Keys and copy a key. Credits read as Spider credits: 10,000 make $1.',
    'data',
    'api',
    10000,
    true,
    30000,
    'https://spider.cloud/credits/new',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Web crawling and scraping API for AI pipelines, billed from prepaid credits.',
    'https://spider.cloud'
  ),
  (
    'anyapi',
    'AnyAPI',
    '/logos/anyapi.png',
    'https://api.getanyapi.com/openapi.json',
    'In your AnyAPI account, copy your API key. A run-only key cannot read the wallet, so use one that can. Checking the balance is free.',
    'ai',
    'api',
    5,
    true,
    15,
    'https://getanyapi.com',
    '[
      {"credit_type":"wallet","label":"Wallet","unit":"usd"}
    ]'::jsonb,
    null,
    'One API key and one USD wallet for many third-party APIs.',
    'https://getanyapi.com'
  ),
  (
    'orbisearch',
    'OrbiSearch',
    '/logos/orbisearch.png',
    'https://orbisearch.com/docs/api-reference/credits',
    'In the OrbiSearch dashboard, copy your API key. This reads pay-as-you-go credits; unlimited plans are not covered yet.',
    'data',
    'api',
    100,
    true,
    300,
    'https://orbisearch.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'B2B email finder and verifier with company enrichment, billed from credits.',
    'https://orbisearch.com'
  ),
  (
    'reapi',
    'ReAPI',
    '/logos/reapi.png',
    'https://reapi.ai/docs/api/balance',
    'In the ReAPI dashboard, create an API key and copy it. One credit is $0.001. Checking the balance costs no credits.',
    'ai',
    'api',
    1000,
    true,
    3000,
    'https://reapi.ai/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Image, video, audio and chat model API, billed from prepaid credits.',
    'https://reapi.ai'
  ),
  (
    'mobiusengine-jobs',
    'Arihaan Jobs',
    '/logos/mobiusengine-jobs.png',
    'https://jobs.arihaan.ai/docs/api/usage',
    'In the Arihaan Jobs dashboard, copy your API key. This reads a monthly plan''s daily token limit, which resets at 00:00 UTC; pay-per-job balances are not covered yet. Checking it is free.',
    'data',
    'api',
    10000,
    true,
    30000,
    'https://jobs.arihaan.ai/pricing',
    '[
      {"credit_type":"daily_tokens","label":"Daily tokens","unit":"credits"}
    ]'::jsonb,
    null,
    'Job postings API pulled from employer career sites, metered in daily tokens.',
    'https://jobs.arihaan.ai'
  ),
  (
    'eodhd',
    'EODHD',
    '/logos/eodhd.png',
    'https://eodhd.com/financial-apis/user-api',
    'In your EODHD account dashboard, copy your API token. Daily calls reset at 00:00 GMT. Checking usage does not cost an API call.',
    'data',
    'api',
    1000,
    true,
    3000,
    'https://eodhd.com/pricing',
    '[
      {"credit_type":"daily","label":"Daily API calls","unit":"credits"},
      {"credit_type":"extra","label":"Extra API calls","unit":"credits"}
    ]'::jsonb,
    null,
    'Stock, fundamentals and market data API with a daily call limit.',
    'https://eodhd.com'
  ),
  (
    'x',
    'X',
    '/logos/x.png',
    'https://docs.x.com/x-api/usage/get-usage',
    'In the X Developer Console, open your app and copy its bearer token. This reads the monthly Post read cap; the prepaid USD balance lives only in the Console.',
    'data',
    'api',
    10000,
    true,
    30000,
    'https://console.x.com',
    '[
      {"credit_type":"post_reads","label":"Post reads","unit":"credits"}
    ]'::jsonb,
    null,
    'The X API, with a monthly cap on Post reads per project.',
    'https://x.com'
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
