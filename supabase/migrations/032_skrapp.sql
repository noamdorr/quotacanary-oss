-- Add Skrapp email credit balance support.
-- Skrapp exposes account email credit quota and used counts through a
-- read-only account endpoint.
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
values (
  'skrapp',
  'Skrapp',
  '/logos/skrapp.png',
  'https://skrapp.io/api',
  'Go to Skrapp Account Settings -> API Access Key and copy your API key',
  'email_finding',
  'api',
  500,
  true,
  1500,
  'https://skrapp.io/pricing',
  '[
    {"credit_type":"email","label":"Email Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'B2B email finding and verification for outreach, billed from monthly email credits.',
  'https://skrapp.io'
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
