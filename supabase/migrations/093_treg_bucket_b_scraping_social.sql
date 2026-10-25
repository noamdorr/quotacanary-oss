-- 093_treg_bucket_b_scraping_social.sql
-- treg Bucket B slice B5: a SERP scraper, a browser-agent wallet and a
-- social-data API, all catalog entries. Litescrape reports remaining calls;
-- TinyFish reports a USD wallet balance (404 when the account is not on
-- wallet billing); TikHub reports a USD account balance.
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
    'litescrape',
    'Litescrape',
    '/logos/litescrape.png',
    'https://litescrape.com/docs/key-status',
    'In the Litescrape dashboard, copy your API key. Checking the balance costs no calls, even at zero.',
    'data',
    'api',
    100,
    true,
    300,
    'https://litescrape.com/pricing',
    '[
      {"credit_type":"calls","label":"Calls","unit":"credits"}
    ]'::jsonb,
    null,
    'SERP and web scraping API for Google, Amazon, TikTok and more, billed per call.',
    'https://litescrape.com'
  ),
  (
    'tinyfish',
    'TinyFish',
    '/logos/tinyfish.png',
    'https://docs.tinyfish.ai/api-reference/wallet/get-wallet',
    'In the TinyFish dashboard, open API Keys and copy a key. The balance check needs an account on wallet billing.',
    'data',
    'api',
    5,
    true,
    15,
    'https://www.tinyfish.ai/pricing',
    '[
      {"credit_type":"wallet","label":"Wallet","unit":"usd"}
    ]'::jsonb,
    null,
    'Browser agent API for web automation, fetch and search, billed from a USD wallet.',
    'https://www.tinyfish.ai'
  ),
  (
    'tikhub',
    'TikHub',
    '/logos/tikhub.png',
    'https://docs.tikhub.io/186826050e0',
    'In the TikHub user center, open API Token and create a token with the /api/v1/tikhub/user/ scope. Checking the balance is free.',
    'data',
    'api',
    5,
    true,
    15,
    'https://tikhub.io/pricing',
    '[
      {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
    ]'::jsonb,
    null,
    'Social data API for TikTok, Douyin, Instagram and more, billed from a USD balance.',
    'https://tikhub.io'
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
