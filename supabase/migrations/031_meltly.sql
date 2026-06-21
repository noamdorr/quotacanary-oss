-- Add Melt.ly credit balance support.
-- Melt.ly exposes subscription and pay-as-you-go credits through a read-only
-- authenticated credits endpoint.
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
  'meltly',
  'Melt.ly',
  '/logos/meltly.png',
  'https://melt.ly/docs',
  'Go to Melt.ly -> API key and copy your API key',
  'ai',
  'api',
  5,
  true,
  15,
  'https://melt.ly',
  '[
    {"credit_type":"subscription","label":"Subscription Credits","unit":"credits"},
    {"credit_type":"payg","label":"Pay-as-you-go Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'AI sales research and icebreaker generation, billed from subscription and pay-as-you-go credits.',
  'https://melt.ly'
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
