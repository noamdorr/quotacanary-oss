-- 077_sweep_data_crm.sql
-- Balance-endpoint sweep slice A3: data and CRM vendors with a documented
-- read-only balance endpoint, all catalog entries. HubSpot reports the daily
-- API call limit for private apps (HubSpot credits have no endpoint). Enrich
-- Layer is the Proxycurl successor as a new tool; the inactive proxycurl row
-- is left as it is.
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
    'hubspot',
    'HubSpot',
    '/logos/hubspot.png',
    'https://developers.hubspot.com/docs/api-reference/latest/account/account-information/get-usage-details',
    'In HubSpot, go to Development, then Legacy apps, create a private legacy app and copy its access token from the Auth tab. This watches the daily API call limit your private apps share, not HubSpot credits, which have no API.',
    'data',
    'api',
    50000,
    true,
    150000,
    'https://www.hubspot.com/pricing',
    '[
      {"credit_type":"api_calls","label":"Daily API calls","unit":"credits"}
    ]'::jsonb,
    null,
    'CRM platform. QuotaCanary watches the daily API call limit for private apps, since HubSpot credits have no balance API.',
    'https://www.hubspot.com'
  ),
  (
    'enrichlayer',
    'Enrich Layer',
    '/logos/enrichlayer.png',
    'https://enrichlayer.com/docs/knowledge-base/billing/understanding-credits',
    'In the Enrich Layer dashboard, copy your API key. Former Proxycurl keys do not work here, since Enrich Layer issues new keys.',
    'data',
    'api',
    100,
    true,
    300,
    'https://enrichlayer.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Person and company enrichment API, the successor to Proxycurl, billed from prepaid credits.',
    'https://enrichlayer.com'
  ),
  (
    'deepl',
    'DeepL',
    '/logos/deepl.png',
    'https://developers.deepl.com/api-reference/usage-and-quota/check-usage-and-limits',
    'In your DeepL account, go to API Keys and copy a key. Only DeepL API Pro keys work here; Free keys (ending in :fx) are not supported yet.',
    'data',
    'api',
    50000,
    true,
    150000,
    'https://www.deepl.com/pro-api',
    '[
      {"credit_type":"characters","label":"Characters","unit":"credits"}
    ]'::jsonb,
    null,
    'Machine translation API, billed per character against your plan or cost-control limit.',
    'https://www.deepl.com'
  ),
  (
    'uplead',
    'UpLead',
    '/logos/uplead.png',
    'https://docs.uplead.com/',
    'In UpLead, open the API page in your account and copy your API key.',
    'data',
    'api',
    20,
    true,
    60,
    'https://www.uplead.com/pricing/',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'B2B contact and company data, billed from prepaid credits.',
    'https://www.uplead.com'
  ),
  (
    'crustdata',
    'Crustdata',
    '/logos/crustdata.png',
    'https://docs.crustdata.com/api-reference/account-apis/get-account-credit-balance',
    'In Crustdata, copy your API key from the dashboard. Credits are shared by every key on the account, and top-ups count toward the balance.',
    'data',
    'api',
    1000,
    true,
    3000,
    'https://crustdata.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Company and people data API with live signals, billed from a shared credit balance.',
    'https://crustdata.com'
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
