-- 075_sweep_outreach_email_infra.sql
-- Balance-endpoint sweep slice A1: outreach and email infrastructure vendors
-- with a documented read-only balance endpoint, all catalog entries. Clay and
-- Instantly report two pools each. Brevo was left out: its account endpoint
-- lists plans in an array whose order is undocumented, and the catalog can
-- only index that array by position.
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
    'clay',
    'Clay',
    '/logos/clay.png',
    'https://developers.clay.com/api-reference/credits/get-workspace-credit-balances',
    'In Clay, go to Settings, then Account, and create an API key. Data credits and actions show as separate balances, and checking them costs no credits.',
    'data',
    'api',
    500,
    true,
    1500,
    'https://www.clay.com/pricing',
    '[
      {"credit_type":"credits","label":"Data credits","unit":"credits"},
      {"credit_type":"actions","label":"Actions","unit":"credits"}
    ]'::jsonb,
    null,
    'GTM data enrichment workbench, billed from data credits and actions.',
    'https://www.clay.com'
  ),
  (
    'instantly',
    'Instantly',
    '/logos/instantly.png',
    'https://developer.instantly.ai/api-reference/workspacebilling/get-workspace-plan-details',
    'In Instantly, go to Settings, then Integrations, then API Keys, and create a key with the workspace_billing:read scope (all:read works too). Credits and leads show as separate balances.',
    'data',
    'api',
    200,
    true,
    600,
    'https://instantly.ai/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"},
      {"credit_type":"leads","label":"Leads","unit":"credits"}
    ]'::jsonb,
    null,
    'Cold email outreach platform, billed from Instantly Credits and a plan lead limit.',
    'https://instantly.ai'
  ),
  (
    'kickbox',
    'Kickbox',
    '/logos/kickbox.png',
    'https://docs.kickbox.com/docs/using-the-api',
    'In Kickbox, go to API, then Manage Keys, and copy a production key (it starts with live_).',
    'email_verification',
    'api',
    100,
    true,
    300,
    'https://kickbox.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Email verification API with a pay-as-you-go verification credit balance.',
    'https://kickbox.com'
  ),
  (
    'sendgrid',
    'SendGrid',
    '/logos/sendgrid.png',
    'https://www.twilio.com/docs/sendgrid/api-reference/users-api/retrieve-your-credit-balance',
    'In SendGrid, go to Settings, then API Keys, and create a key that can read credits (user.credits.read). EU regional subusers are not supported yet.',
    'data',
    'api',
    20,
    true,
    60,
    'https://sendgrid.com/en-us/pricing',
    '[
      {"credit_type":"emails","label":"Emails","unit":"credits"}
    ]'::jsonb,
    null,
    'Transactional and marketing email API from Twilio, with a monthly email credit allotment.',
    'https://sendgrid.com'
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
