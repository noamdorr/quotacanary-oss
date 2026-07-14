-- Add BuiltWith API credit balance support.
-- BuiltWith exposes remaining API credits through a read-only discovery endpoint.
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
  'builtwith',
  'BuiltWith',
  '/logos/builtwith.png',
  'https://api.builtwith.com/agent-payment-api',
  'Go to BuiltWith Agent Payment API configuration, enable Agent API Billing, and copy the Agent API Key',
  'data',
  'api',
  250,
  true,
  750,
  'https://payments.builtwith.com/agent-payment-api-config',
  '[
    {"credit_type":"credits","label":"API Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'Website technology intelligence and lead data APIs, billed from API credits.',
  'https://builtwith.com'
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
