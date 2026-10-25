-- 091_treg_bucket_b_agent_first_data.sql
-- treg Bucket B slice B3: agent-first B2B data APIs with a read-only balance
-- endpoint, all catalog entries. Aviato reads its limit from the balance after
-- the last top-up; GetLeads and MoltSets have unlimited plans with no balance
-- to watch (GetLeads returns no credit count, MoltSets reports -1 and the
-- entry refuses it rather than alerting); Openmart reports the team balance.
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
    'aviato',
    'Aviato',
    '/logos/aviato.png',
    'https://docs.data.aviato.co/api-reference/billing/get-balance',
    'In the Aviato dashboard, open your team, then API Keys, and create a key. The limit shown is the balance right after your last top-up.',
    'data',
    'api',
    100,
    true,
    300,
    'https://data.aviato.co',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'People and company data API, billed from prepaid credits.',
    'https://www.aviato.co'
  ),
  (
    'getleads',
    'GetLeads',
    '/logos/getleads.png',
    'https://www.getleads.io/docs/',
    'In the GetLeads app, create an API key under API keys (it starts with glb_live_). Checking the balance costs no credits. Unlimited plans have no credit balance to watch.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.getleads.io/pricing/',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'B2B contact search and enrichment API, billed from plan credits.',
    'https://www.getleads.io'
  ),
  (
    'moltsets',
    'MoltSets',
    '/logos/moltsets.png',
    'https://developer.moltsets.com/api-reference/account/get-account',
    'In the MoltSets dashboard, copy your API key. Checking the balance costs no credits. Unlimited plans have no token balance to watch.',
    'data',
    'api',
    100,
    true,
    300,
    'https://moltsets.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Identity resolution API for emails, phones and company data, billed from tokens.',
    'https://moltsets.com'
  ),
  (
    'openmart',
    'Openmart',
    '/logos/openmart.png',
    'https://app.openmart.com/api-docs/get-credit-balance',
    'In the Openmart app, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    50,
    true,
    150,
    'https://www.openmart.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Local business data and decision-maker contacts API, billed from credits.',
    'https://www.openmart.com'
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
