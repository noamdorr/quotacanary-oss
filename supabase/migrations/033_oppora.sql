-- Add Oppora data and phone credit balance support.
-- Oppora exposes remaining credits through a read-only account credits endpoint.
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
  'oppora',
  'Oppora',
  '/logos/oppora.png',
  'https://oppora.ai/docs/api#/Credits',
  'Go to Oppora -> Integrations -> Oppora API -> New key and copy the secret',
  'email_finding',
  'api',
  100,
  true,
  300,
  'https://oppora.ai/pricing',
  '[
    {"credit_type":"data","label":"Data Credits","unit":"credits"},
    {"credit_type":"phone","label":"Phone Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'Outbound sales automation with contact discovery and phone lookup, billed from data and phone credit pools.',
  'https://oppora.ai'
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
