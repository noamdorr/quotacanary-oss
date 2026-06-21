-- Add BetterContact, Shodan, and Verifalia balance support.
-- BetterContact exposes one account credits pool. Shodan exposes query and
-- scan credits. Verifalia uses API username/password credentials and returns
-- credit packs plus optional free daily credits.
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
    'bettercontact',
    'BetterContact',
    '/logos/bettercontact.png',
    'https://doc.bettercontact.rocks/api-reference/endpoint/account',
    'Go to BetterContact -> Settings -> API and copy your API key',
    'email_finding',
    'api',
    500,
    true,
    1500,
    'https://app.bettercontact.rocks',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Waterfall contact enrichment for email and phone, billed from account credits.',
    'https://bettercontact.rocks'
  ),
  (
    'shodan',
    'Shodan',
    '/logos/shodan.png',
    'https://developer.shodan.io/api',
    'Go to account.shodan.io -> Account -> API key and copy your key',
    'data',
    'api',
    25,
    true,
    75,
    'https://account.shodan.io/billing',
    '[
      {"credit_type":"query","label":"Query Credits","unit":"credits"},
      {"credit_type":"scan","label":"Scan Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Internet intelligence and search APIs, billed from query and scan credits.',
    'https://shodan.io'
  ),
  (
    'verifalia',
    'Verifalia',
    '/logos/verifalia.png',
    'https://verifalia.com/developers/credits',
    'Go to Verifalia -> Client area -> Users or API credentials and copy your username and password',
    'email_verification',
    'api',
    1000,
    true,
    3000,
    'https://verifalia.com/client-area',
    '[
      {"credit_type":"credit_packs","label":"Credit Packs","unit":"credits"},
      {"credit_type":"free_daily","label":"Free Daily Credits","unit":"credits"}
    ]'::jsonb,
    '[
      {"name":"username","label":"API username","type":"text"},
      {"name":"password","label":"API password","type":"password"}
    ]'::jsonb,
    'Email verification and list cleaning, billed from credit packs and optional free daily credits.',
    'https://verifalia.com'
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
