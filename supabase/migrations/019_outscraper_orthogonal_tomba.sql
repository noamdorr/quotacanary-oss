-- Add Outscraper, Orthogonal, and Tomba balance support.
-- Outscraper and Orthogonal expose one USD balance pool. Tomba exposes
-- separate prospecting credit pools and needs an API key plus API secret.
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
  credential_fields
)
values
  (
    'outscraper',
    'Outscraper',
    '/logos/outscraper.png',
    'https://docs.outscraper.com/endpoints/profile-balance/',
    'Go to Outscraper -> Profile -> API Key and copy your API key',
    'data',
    'api',
    25,
    true,
    75,
    'https://app.outscraper.com/billing',
    null,
    null
  ),
  (
    'orthogonal',
    'Orthogonal',
    '/logos/orthogonal.png',
    'https://docs.orthogonal.com/api-reference/balance',
    'Go to Orthogonal -> Dashboard -> API Keys and copy your API key',
    'data',
    'api',
    5,
    true,
    15,
    'https://orthogonal.com/dashboard/balance',
    null,
    null
  ),
  (
    'tomba',
    'Tomba',
    '/logos/tomba.png',
    'https://docs.tomba.io/api/account',
    'Go to Tomba -> Dashboard -> API Keys and copy your API key and API secret',
    'email_finding',
    'api',
    500,
    true,
    null,
    'https://app.tomba.io/billing',
    '[
      {"credit_type":"searches","label":"Searches","unit":"credits"},
      {"credit_type":"verifications","label":"Verifications","unit":"credits"},
      {"credit_type":"phones","label":"Phones","unit":"credits"},
      {"credit_type":"b2b","label":"B2B","unit":"credits"}
    ]'::jsonb,
    '[
      {"name":"key","label":"API key","type":"text"},
      {"name":"secret","label":"API secret","type":"password"}
    ]'::jsonb
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
  credential_fields       = excluded.credential_fields;
