-- Add Apollo credit balance support.
-- Apollo's usage_stats/credit_usage_stats endpoint reports remaining balance
-- per credit type, read-only and at zero credit cost, so the "consumption only"
-- reason Apollo sat outside the catalog no longer holds.
-- The declared pools are the four a GTM stack watches; the adapter reports any
-- other pool the account funds, and skips the ones the plan does not include.
-- Numbered 062 because QUO-96 holds a claim on 060 and 061.
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
  'apollo',
  'Apollo',
  '/logos/apollo.png',
  'https://docs.apollo.io/reference/view-api-usage-stats',
  'Go to Apollo -> Settings -> Integrations -> API -> API keys -> Create new key, scope it to api/v1/usage_stats/credit_usage_stats only, and copy it',
  'email_finding',
  'api',
  500,
  true,
  1500,
  'https://app.apollo.io/#/settings/plans/upgrade',
  '[
    {"credit_type":"lead_credit","label":"Lead Credits","unit":"credits"},
    {"credit_type":"export_credit","label":"Export Credits","unit":"credits"},
    {"credit_type":"direct_dial_credit","label":"Direct Dial Credits","unit":"credits"},
    {"credit_type":"ai_credit","label":"AI Credits","unit":"credits"}
  ]'::jsonb,
  null,
  'B2B contact database and sales engagement, metered from separate lead, export, dial, and AI credit pools.',
  'https://www.apollo.io'
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
