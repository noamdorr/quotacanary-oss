-- Deepgram (QUO-230): prepaid USD balances, kept per project. Hand-written
-- adapter: it lists the projects the key can see, then reads each project's
-- balances (two sequential requests, an array sum, pools keyed by discovered
-- project ids), which the catalog's one-request shape cannot express. pools
-- is null on purpose: the adapter reports one `project:<id>` pool per
-- project, the dashboard renders every reported pool, and a null list means
-- watch-all (no picker of placeholder pools). Thresholds in dollars, like fal.
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
    'deepgram',
    'Deepgram',
    '/logos/deepgram.png',
    'https://developers.deepgram.com/reference/manage/billing/list',
    'In the Deepgram Console, pick the project, open Settings > API Keys and click Create a New API Key. Give it the Admin or Owner role: a Member key can list projects but cannot read billing. Deepgram shows the key only once.',
    'ai',
    'api',
    5,
    true,
    15,
    'https://deepgram.com/pricing',
    null,
    null,
    'Speech-to-text, text-to-speech and voice agent APIs, billed from a prepaid dollar balance on each project.',
    'https://deepgram.com'
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
