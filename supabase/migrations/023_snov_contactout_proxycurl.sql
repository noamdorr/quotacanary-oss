-- Add Snov.io, ContactOut, and Proxycurl balance support.
-- Snov.io exchanges client credentials for a bearer token before reading one
-- credits pool. ContactOut exposes monthly email, phone, and search credit
-- pools. Proxycurl exposes one shared API credit balance.
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
    'snov',
    'Snov.io',
    '/logos/snov.png',
    'https://snov.io/api',
    'Go to Snov.io -> Account -> API and copy your API User ID and API Secret',
    'email_finding',
    'api',
    500,
    true,
    1500,
    'https://app.snov.io/billing',
    null,
    '[
      {"name":"clientId","label":"API User ID","type":"text"},
      {"name":"clientSecret","label":"API Secret","type":"password"}
    ]'::jsonb,
    'Email finding, verification, and outreach automation, billed from account credits.',
    'https://snov.io'
  ),
  (
    'contactout',
    'ContactOut',
    '/logos/contactout.png',
    'https://api.contactout.com/#api-usage-stats',
    'Go to ContactOut -> API and copy your API token',
    'email_finding',
    'api',
    100,
    true,
    300,
    'https://contactout.com/pricing',
    '[
      {"credit_type":"email","label":"Email Credits","unit":"credits"},
      {"credit_type":"phone","label":"Phone Credits","unit":"credits"},
      {"credit_type":"search","label":"Search Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'B2B contact data and people search, with separate email, phone, and search credit pools.',
    'https://contactout.com'
  ),
  (
    'proxycurl',
    'Proxycurl',
    '/logos/proxycurl.png',
    'https://nubela.co/proxycurl/docs#view-credit-balance-endpoint',
    'Go to Proxycurl dashboard -> API and copy your API key',
    'data',
    'api',
    100,
    true,
    300,
    'https://nubela.co/proxycurl/pricing',
    null,
    null,
    'LinkedIn and company data APIs, billed from a shared API credit balance.',
    'https://nubela.co/proxycurl'
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
