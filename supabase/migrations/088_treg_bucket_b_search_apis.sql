-- 088_treg_bucket_b_search_apis.sql
-- treg Bucket B slice B4: search APIs with a read-only balance endpoint, all
-- catalog entries. Serper's /account route is undocumented by the vendor and
-- answers a bad key with 403; Search1API's `usage` field is the credits
-- remaining; Valyu needs a key with the billing:read management scope.
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
    'serper',
    'Serper',
    '/logos/serper.png',
    'https://serper.dev',
    'In the Serper dashboard, open API Keys and copy your key. Checking the balance costs no credits.',
    'data',
    'api',
    250,
    true,
    750,
    'https://serper.dev/billing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Google search results (SERP) API, billed from prepaid credits.',
    'https://serper.dev'
  ),
  (
    'linkup',
    'Linkup',
    '/logos/linkup.png',
    'https://docs.linkup.so/api-reference/credits/creditsbalance',
    'In the Linkup dashboard, copy your API key. The balance shows in Linkup credits, which can be fractional.',
    'data',
    'api',
    1,
    true,
    3,
    'https://app.linkup.so/billing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Web search API for AI agents, billed from prepaid credits.',
    'https://www.linkup.so'
  ),
  (
    'search1api',
    'Search1API',
    '/logos/search1api.png',
    'https://s1.dev/docs/essentials/credits-and-limits',
    'In the Search1API dashboard, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    500,
    true,
    1500,
    'https://s1.dev/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Search, news and crawl API, billed from prepaid credits.',
    'https://s1.dev'
  ),
  (
    'valyu',
    'Valyu',
    '/logos/valyu.png',
    'https://github.com/valyuAI/valyu-cli',
    'In the Valyu platform, create an API key with the billing:read scope and copy it. Data keys lack that scope by default and are rejected here.',
    'data',
    'api',
    5,
    true,
    15,
    'https://www.valyu.ai/pricing',
    '[
      {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
    ]'::jsonb,
    null,
    'Search API over web and proprietary data for AI agents, billed from a prepaid USD balance.',
    'https://www.valyu.ai'
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
