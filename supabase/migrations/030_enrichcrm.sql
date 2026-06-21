-- Add Enrich CRM balance support.
-- Enrich CRM exposes one read-only remaining credits endpoint keyed by apiId.
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
  'enrichcrm',
  'Enrich CRM',
  '/logos/enrichcrm.png',
  'https://enrich-crm.readme.io/reference/getremainingcredits',
  'Go to Enrich CRM -> API settings and copy your API key',
  'email_finding',
  'api',
  500,
  true,
  1500,
  'https://app.enrich-crm.com',
  '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'Real-time CRM enrichment and intent data, billed from a shared credit pool.',
  'https://enrich-crm.com'
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
