-- Add ScrapeGraphAI, MailerCheck, and Email Hippo balance support.
-- All three expose read-only endpoints for remaining credits or quota.
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
  pools
)
values
  (
    'scrapegraphai',
    'ScrapeGraphAI',
    '/logos/scrapegraphai.png',
    'https://docs.scrapegraphai.com/api-reference/endpoint/credits',
    'Go to ScrapeGraphAI -> Dashboard -> API Keys and copy your API key',
    'data',
    'api',
    5000,
    true,
    15000,
    null
  ),
  (
    'mailercheck',
    'MailerCheck',
    '/logos/mailercheck.png',
    'https://developers.mailercheck.com/account',
    'Go to MailerCheck -> Profile -> API -> Create token',
    'email_verification',
    'api',
    1000,
    true,
    null,
    null
  ),
  (
    'emailhippo',
    'Email Hippo',
    '/logos/emailhippo.png',
    'https://help.emailhippo.com/how-to-check-your-more-api-quota-using-the-api',
    'Go to Email Hippo -> MORE -> API Keys and copy your license key',
    'email_verification',
    'api',
    1000,
    true,
    null,
    '[
      {"credit_type":"quota","label":"Quota","unit":"credits"}
    ]'::jsonb
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
  pools                   = excluded.pools;
