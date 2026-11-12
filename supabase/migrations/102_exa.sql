-- 102_exa.sql
-- Exa as a catalog tool. GET https://admin-api.exa.ai/team-management/credits
-- answers {"credits_usd":n,...}, the team's remaining prepaid balance in USD,
-- read with a service key in x-api-key. Exa enables the Team Management API
-- per team, so a normal search key gets a 401.
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
    'exa',
    'Exa',
    '/logos/exa.png',
    'https://exa.ai/docs/reference/team-management/get-team-credits',
    'This needs an Exa service key, not a search key. Ask support@exa.ai to turn on the Team Management API for your team, then create one under API keys, Service keys.',
    'data',
    'api',
    5,
    true,
    15,
    'https://dashboard.exa.ai/billing',
    '[
      {"credit_type":"balance","label":"Balance","unit":"usd"}
    ]'::jsonb,
    null,
    'Web search and content API for AI apps, billed from prepaid USD credits.',
    'https://exa.ai'
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
