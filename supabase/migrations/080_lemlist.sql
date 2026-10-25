-- lemlist (QUO-226): the team credit balance that pays for email and phone
-- enrichment. Hand-written adapter: lemlist authenticates with HTTP Basic,
-- empty username and the API key as the password, which the catalog's {key}
-- template cannot base64-encode.
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
    'lemlist',
    'lemlist',
    '/logos/lemlist.png',
    'https://developer.lemlist.com/api-reference/endpoints/team/get-team-credits',
    'In lemlist, click your profile picture, open Settings > Integrations and click Generate a new API key. lemlist shows the key only once. Credits are shared by the whole team.',
    'data',
    'api',
    100,
    true,
    300,
    'https://www.lemlist.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Cold outreach sequencer for email and LinkedIn, with lead data enrichment billed from a team credit balance.',
    'https://www.lemlist.com'
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
