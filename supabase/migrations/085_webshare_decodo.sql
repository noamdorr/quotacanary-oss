-- Webshare and Decodo (QUO-231): residential proxy traffic, read in GB.
-- Hand-written adapters, because each reading takes more than one request,
-- which the catalog's one-request shape cannot express. Webshare: the
-- subscription (active plan id, free credits, period start), then the plan
-- (bandwidth cap, 0 = unlimited), then the period's usage aggregate (bytes).
-- Decodo: the residential subscription's traffic limit, then the sum of every
-- sub-user's traffic. Thresholds in GB (integer columns): Critical 1, Low 3,
-- sized to the smallest residential plans (Webshare 1 GB, Decodo 3 GB), the
-- iproyal precedent. Webshare's free-credits pool (USD) shares them.
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
    'webshare',
    'Webshare',
    '/logos/webshare.png',
    'https://apidocs.webshare.io/subscription',
    'In the Webshare dashboard, open API Keys (dashboard.webshare.io/userapi/keys), create a key and copy it.',
    'data',
    'api',
    1,
    true,
    3,
    'https://www.webshare.io/pricing',
    '[{"credit_type":"traffic","label":"Traffic","unit":"gb"},{"credit_type":"free_credits","label":"Free credits","unit":"usd"}]'::jsonb,
    null,
    'Datacenter, static and rotating residential proxies, with plans capped by monthly bandwidth in GB.',
    'https://www.webshare.io'
  ),
  (
    'decodo',
    'Decodo',
    '/logos/decodo.png',
    'https://help.decodo.com/api-reference/subscriptions/get-subscriptions',
    'In the Decodo dashboard, click the Account and Settings icon at the top right, then Settings, and open the API Keys tab. Name the key, click Create and copy it: Decodo shows it only once.',
    'data',
    'api',
    1,
    true,
    3,
    'https://decodo.com/proxies/residential-proxies/pricing',
    '[{"credit_type":"traffic","label":"Residential traffic","unit":"gb"}]'::jsonb,
    null,
    'Residential proxy network (formerly Smartproxy), billed by the GB of traffic.',
    'https://decodo.com'
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
