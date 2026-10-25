-- People Data Labs (QUO-228): the remaining credit balance for person
-- enrichment. Hand-written adapter: PDL exposes the balance only in response
-- headers (x-totallimit-remaining), and the catalog reads JSON bodies.
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
    'peopledatalabs',
    'People Data Labs',
    '/logos/peopledatalabs.png',
    'https://docs.peopledatalabs.com/docs/usage-limits',
    'In the People Data Labs dashboard, click API Keys and copy the Active Key. The check reads the credit headers of a request with no parameters, so it never runs an enrichment.',
    'data',
    'api',
    25,
    true,
    75,
    'https://www.peopledatalabs.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Person and company data API for enrichment and search, billed per matched record from a credit balance.',
    'https://www.peopledatalabs.com'
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
