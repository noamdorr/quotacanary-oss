-- 090_treg_bucket_b_company_data.sql
-- treg Bucket B slice B2: company and people data APIs with a read-only
-- balance endpoint, all catalog entries. CompanyEnrich reports total and used
-- (balance derived); Fetchin's creditsRemaining includes pay-as-you-go credits
-- and can exceed the plan limit, so no limit is read; Fiber AI returns one
-- entry per subscription and the first one is watched.
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
    'companyenrich',
    'CompanyEnrich',
    '/logos/companyenrich.png',
    'https://docs.companyenrich.com/reference/get_me',
    'In the CompanyEnrich dashboard, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true,
    300,
    'https://companyenrich.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Company and people data API for enrichment and search, billed from credits.',
    'https://companyenrich.com'
  ),
  (
    'fetchin',
    'Fetchin',
    '/logos/fetchin.png',
    'https://docs.fetchin.io/api-reference/endpoint/get-subscription',
    'In the Fetchin dashboard, copy your API key. The balance counts pay-as-you-go credits on top of your plan, and checking it costs no credits.',
    'data',
    'api',
    100,
    true,
    300,
    'https://fetchin.io/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Real-time professional profile and company data API, billed from credits.',
    'https://fetchin.io'
  ),
  (
    'fiberai',
    'Fiber AI',
    '/logos/fiberai.png',
    'https://docs.fiber.ai/billing',
    'In the Fiber AI dashboard, copy your API key. Checking the balance costs no credits. With more than one subscription, the first one is watched.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.fiber.ai/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Company and people data API for AI agents, billed from credits.',
    'https://www.fiber.ai'
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
