-- Twilio, Plivo, Vonage (QUO-227): CPaaS account balances. Hand-written
-- adapters: each authenticates with HTTP Basic over two values (Twilio Account
-- SID + Auth token, Plivo Auth ID + Auth token, Vonage API key + API secret),
-- which the catalog's single {key} template cannot base64-encode, so each row
-- sets credential_fields and the connect form renders two inputs.
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
    'twilio',
    'Twilio',
    '/logos/twilio.png',
    'https://www.twilio.com/docs/iam/api/account',
    'In the Twilio Console home page, find Account Info and copy the Account SID and the Auth Token. Use the parent account: subaccounts have no balance of their own. The balance shows in US dollars; accounts billed in another currency are not supported yet.',
    'data',
    'api',
    5,
    true,
    15,
    'https://console.twilio.com/us1/billing/manage-billing/billing-overview',
    '[
      {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
    ]'::jsonb,
    '[
      {"name":"account_sid","label":"Account SID","type":"text"},
      {"name":"auth_token","label":"Auth token","type":"password"}
    ]'::jsonb,
    'Communications platform API for SMS, voice and WhatsApp, billed from a prepaid balance in dollars.',
    'https://www.twilio.com'
  ),
  (
    'plivo',
    'Plivo',
    '/logos/plivo.png',
    'https://www.plivo.com/docs/account/api/account',
    'In the Plivo console, open the Overview page and copy the Auth ID and the Auth Token. The balance shows in US dollars.',
    'data',
    'api',
    5,
    true,
    15,
    'https://console.plivo.com/billing/',
    '[
      {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
    ]'::jsonb,
    '[
      {"name":"auth_id","label":"Auth ID","type":"text"},
      {"name":"auth_token","label":"Auth token","type":"password"}
    ]'::jsonb,
    'SMS and voice API for business messaging, billed from a cash credit balance in dollars.',
    'https://www.plivo.com'
  ),
  (
    'vonage',
    'Vonage',
    '/logos/vonage.png',
    'https://developer.vonage.com/en/api/account',
    'In the Vonage API Dashboard, copy the API key and the API secret from the home page (both also live under Settings). The balance shows in euros.',
    'data',
    'api',
    5,
    true,
    15,
    'https://dashboard.nexmo.com/billing-and-payments',
    '[
      {"credit_type":"balance","label":"Balance (EUR)","unit":"eur"}
    ]'::jsonb,
    '[
      {"name":"api_key","label":"API key","type":"text"},
      {"name":"api_secret","label":"API secret","type":"password"}
    ]'::jsonb,
    'Communications APIs for SMS, voice and verification, billed from an account balance in euros.',
    'https://www.vonage.com'
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
