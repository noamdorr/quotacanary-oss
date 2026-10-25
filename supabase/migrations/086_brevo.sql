-- Brevo (QUO-250): email and SMS send credits from GET /v3/account. The
-- balance lives in plan[], one entry per plan type in an undocumented order,
-- and an account can carry both a subscription and pay-as-you-go entry, so the
-- catalog's positional plan.0.credits would read the wrong pool. Hand-written
-- adapter that selects entries by type. Pools: emails (subscription +
-- payAsYouGo), sms, free_emails (the free plan's daily allowance, which
-- resets). Thresholds Critical 500 / Low 1500, sized to Starter's 5,000
-- emails a month; the SMS and free pools share them per tool.
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
    'brevo',
    'Brevo',
    '/logos/brevo.png',
    'https://developers.brevo.com/reference/getaccount',
    'In Brevo, open SMTP & API (app.brevo.com/settings/keys/api), open the API keys tab and click Generate a new API key. Name it, click Generate and copy it: Brevo shows the key only once.',
    'data',
    'api',
    500,
    true,
    1500,
    'https://www.brevo.com/pricing/',
    '[
      {"credit_type":"emails","label":"Email credits","unit":"credits"},
      {"credit_type":"sms","label":"SMS credits","unit":"credits"},
      {"credit_type":"free_emails","label":"Free daily emails","unit":"credits"}
    ]'::jsonb,
    null,
    'Email, SMS and marketing automation platform (formerly Sendinblue), with sends paid from email and SMS credits.',
    'https://www.brevo.com'
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
