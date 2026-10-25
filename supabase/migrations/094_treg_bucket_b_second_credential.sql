-- 094_treg_bucket_b_second_credential.sql
-- treg Bucket B slice H1: three balances that need a second value beside the
-- key, so each is a hand-written adapter and each row sets credential_fields
-- (the connect form renders two inputs). HLR Lookup takes an API key and API
-- secret in the JSON body; Icypeas takes the account email in the body beside
-- the key; The Companies API reads credits per team, and the team id comes
-- from the dashboard.
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
    'hlrlookup',
    'HLR Lookup',
    '/logos/hlrlookup.png',
    'https://www.hlrlookup.com/knowledge',
    'In your HLR Lookup account, copy the API key and the API secret.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.hlrlookup.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    '[
      {"name":"api_key","label":"API key","type":"text"},
      {"name":"api_secret","label":"API secret","type":"password"}
    ]'::jsonb,
    'Phone number validation API with live HLR and MNP lookups, billed from prepaid credits.',
    'https://www.hlrlookup.com'
  ),
  (
    'icypeas',
    'Icypeas',
    '/logos/icypeas.png',
    'https://api-doc.icypeas.com/subscriptions/subscription-information/',
    'In Icypeas, open your profile and go to the API section to copy the API key. Also enter the email you sign in to Icypeas with: the balance check asks for it.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.icypeas.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    '[
      {"name":"api_key","label":"API key","type":"password"},
      {"name":"email","label":"Account email","type":"text"}
    ]'::jsonb,
    'Email finder and verifier API for B2B contacts, billed from credits.',
    'https://www.icypeas.com'
  ),
  (
    'thecompaniesapi',
    'The Companies API',
    '/logos/thecompaniesapi.png',
    'https://www.thecompaniesapi.com/api/fetch-team',
    'In The Companies API, open Settings and then API tokens to create a token. Copy your team ID from the dashboard as well: credits belong to the team.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.thecompaniesapi.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    '[
      {"name":"api_token","label":"API token","type":"password"},
      {"name":"team_id","label":"Team ID","type":"text"}
    ]'::jsonb,
    'Company data API for enrichment, search and lookalikes, billed from team credits.',
    'https://www.thecompaniesapi.com'
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
