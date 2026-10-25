-- 074_treg_gap_seo_ai_visibility.sql
-- Third onboarding slice from the treg catalog gap: three SEO data vendors
-- and one AI visibility vendor with a documented read-only balance endpoint.
-- SE Ranking, cloro and Serpstat are catalog entries; Majestic is hand-written
-- because it answers every failure with HTTP 200 and an ErrorMessage that
-- echoes the submitted key, so its error copy is mapped from Code instead.
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
    'seranking',
    'SE Ranking',
    '/logos/seranking.png',
    'https://seranking.com/api/data/account-system/',
    'In SE Ranking, open the API dashboard and copy your Data API key. Checking the balance costs no units.',
    'data',
    'api',
    100000,
    true,
    300000,
    'https://seranking.com/api.html',
    '[
      {"credit_type":"units","label":"API units","unit":"credits"}
    ]'::jsonb,
    null,
    'SEO data API for keywords, backlinks, domains and SERPs, billed from API units.',
    'https://seranking.com'
  ),
  (
    'cloro',
    'cloro',
    '/logos/cloro.png',
    'https://cloro.dev/docs/api-reference/endpoint/get-credits',
    'Go to the cloro dashboard, copy your API key. The balance can trail live usage by up to a minute.',
    'data',
    'api',
    2500,
    true,
    7500,
    'https://cloro.dev/pricing/',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'AI search answers from ChatGPT, Perplexity, Gemini and more as an API, billed from credits.',
    'https://cloro.dev'
  ),
  (
    'serpstat',
    'Serpstat',
    '/logos/serpstat.png',
    'https://api-docs.serpstat.com/docs/serpstat-public-api/p2grcut8yurv0-get-stats',
    'Go to serpstat.com/users/profile, copy your API token. Checking the balance costs no credits.',
    'data',
    'api',
    5000,
    true,
    15000,
    'https://serpstat.com/page/pricing-plans/',
    '[
      {"credit_type":"credits","label":"API credits","unit":"credits"}
    ]'::jsonb,
    null,
    'SEO platform API for keyword, domain, backlink and SERP data, billed per returned row.',
    'https://serpstat.com'
  ),
  (
    'majestic',
    'Majestic',
    '/logos/majestic.png',
    'https://developer-support.majestic.com/api/commands/get-subscription-info.shtml',
    'In your Majestic account, open the API settings and copy your API key. Analysis, retrieval and index item info units show as separate balances.',
    'data',
    'api',
    10000,
    true,
    30000,
    'https://majestic.com/plans-pricing',
    '[
      {"credit_type":"analysis_units","label":"Analysis units","unit":"credits"},
      {"credit_type":"retrieval_units","label":"Retrieval units","unit":"credits"},
      {"credit_type":"index_item_info_units","label":"Index item info units","unit":"credits"}
    ]'::jsonb,
    null,
    'Backlink index API with Trust Flow and Citation Flow, billed from analysis, retrieval and index item info units.',
    'https://majestic.com'
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
