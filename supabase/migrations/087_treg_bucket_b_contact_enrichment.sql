-- 087_treg_bucket_b_contact_enrichment.sql
-- treg Bucket B slice B1: contact-enrichment vendors with a documented
-- read-only balance endpoint, all catalog entries. BlitzAPI bills in records
-- that reset monthly; DropLeads reads the Prime-DB credit balance; Leadsforge
-- reads available credits, excluding credits reserved by running searches.
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
    'aiark',
    'AI Ark',
    '/logos/aiark.png',
    'https://docs.ai-ark.com/reference/fetch-credit',
    'In the AI Ark developer portal, create an API key and copy it. Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true,
    300,
    'https://ai-ark.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'B2B people and company search with contact enrichment, billed from prepaid credits.',
    'https://ai-ark.com'
  ),
  (
    'blitzapi',
    'BlitzAPI',
    '/logos/blitzapi.png',
    'https://docs.blitz-api.ai/api-reference/account/get-api-key-details',
    'In the BlitzAPI dashboard, copy your API key. Checking the balance costs no records.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.blitz-api.ai/pricing',
    '[
      {"credit_type":"credits","label":"Records","unit":"credits"}
    ]'::jsonb,
    null,
    'Contact and company enrichment API, billed in records that reset every month.',
    'https://www.blitz-api.ai'
  ),
  (
    'dropleads',
    'DropLeads',
    '/logos/dropleads.png',
    'https://dropleads.readme.io/reference/get_api-v2-prime-db-credits-balance',
    'In DropLeads, copy your Prime-DB API key. Keys for other DropLeads products do not work here.',
    'data',
    'api',
    250,
    true,
    750,
    'https://www.dropleads.io/#pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'B2B lead database with verified contacts, billed from prepaid credits.',
    'https://www.dropleads.io'
  ),
  (
    'leadsforge',
    'Leadsforge',
    '/logos/leadsforge.png',
    'https://api.leadsforge.ai/public/swagger/index.html',
    'In Leadsforge, open your account settings and copy your API key. Credits reserved for running searches do not count toward the balance.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.leadsforge.ai/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'AI lead generation and contact enrichment, billed from prepaid credits.',
    'https://www.leadsforge.ai'
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
