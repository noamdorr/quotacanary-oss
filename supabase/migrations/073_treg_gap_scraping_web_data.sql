-- 073_treg_gap_scraping_web_data.sql
-- Second onboarding slice from the treg catalog gap: three scraping and web
-- data vendors with a documented read-only balance endpoint.
-- Scrape Creators and Crawl4AI are catalog entries; Diffbot is hand-written
-- because its account endpoint reports only the monthly allowance and daily
-- usage, so remaining credits are computed from the current billing cycle.
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
    'scrapecreators',
    'Scrape Creators',
    '/logos/scrapecreators.png',
    'https://docs.scrapecreators.com/account/credit-balance',
    'Go to app.scrapecreators.com, copy your API key. Every endpoint draws from the same credit balance.',
    'data',
    'api',
    500,
    true,
    1500,
    'https://scrapecreators.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Public social media data from TikTok, Instagram, YouTube and more as an API, billed per credit.',
    'https://scrapecreators.com'
  ),
  (
    'crawl4ai',
    'Crawl4AI',
    '/logos/crawl4ai.png',
    'https://api.crawl4ai.com/docs',
    'Go to api.crawl4ai.com -> Dashboard, copy your API key (it is shown once). The balance trails live usage by about a minute.',
    'data',
    'api',
    100,
    true,
    300,
    'https://api.crawl4ai.com/dashboard/',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Hosted crawling and page extraction for LLM pipelines, billed from prepaid credits.',
    'https://api.crawl4ai.com'
  ),
  (
    'diffbot',
    'Diffbot',
    '/logos/diffbot.png',
    'https://www.diffbot.com/docs/account',
    'Go to app.diffbot.com, copy your API token. Remaining credits are this month''s plan allowance minus what the current billing cycle used.',
    'data',
    'api',
    500,
    true,
    1500,
    'https://www.diffbot.com/pricing',
    '[
      {"credit_type":"credits","label":"Monthly credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Knowledge Graph and AI extraction APIs for web data, billed from a monthly credit allowance.',
    'https://www.diffbot.com'
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
