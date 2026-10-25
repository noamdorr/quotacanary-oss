-- PhantomBuster (QUO-229): monthly execution time, AI credits and email
-- credits. Hand-written adapter: each balance is a plan limit minus a usage
-- counter plus a sum over top-up lots, which the catalog cannot express. One
-- threshold covers all three pools (sized for Starter's 1200 minutes).
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
    'phantombuster',
    'PhantomBuster',
    '/logos/phantombuster.png',
    'https://hub.phantombuster.com/reference/get_orgs-fetch-resources',
    'In PhantomBuster, open Workspace settings from the navbar menu, scroll to Third party API keys and click Add third party API key. PhantomBuster shows the key only once.',
    'data',
    'api',
    60,
    true,
    180,
    'https://phantombuster.com/pricing',
    '[
      {"credit_type":"execution_time","label":"Execution time","unit":"minutes"},
      {"credit_type":"ai_credits","label":"AI credits","unit":"credits"},
      {"credit_type":"emails","label":"Emails","unit":"credits"}
    ]'::jsonb,
    null,
    'Cloud automations that scrape and act on LinkedIn and the web, metered in monthly execution time, AI credits and email credits.',
    'https://phantombuster.com'
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
