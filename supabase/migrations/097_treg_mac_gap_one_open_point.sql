-- QUO-341: five balance reads from the 2026-10-28 treg vs Mac inventory
-- (wiki/raw/2026-10-28-treg-mac-gap-inventory.md), all catalog entries, each
-- with one point the docs leave open until a live read: Datagma's balance is a
-- numeric string, TheirStack's api_credits may be a cycle total, PiAPI's JSON
-- path is undocumented, Fish Audio's unit is unstated (read as USD), and
-- Sumble's probe relies on a no-match search being free.
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
    'datagma',
    'Datagma',
    '/logos/datagma.png',
    'https://datagmaapi.readme.io/reference/ingressservice_getcredit',
    'In your Datagma account, open the API page and copy your API key.',
    'data',
    'api',
    100,
    true,
    300,
    'https://datagma.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Contact and company enrichment API (emails, phones, firmographics), billed from prepaid credits.',
    'https://datagma.com'
  ),
  (
    'theirstack',
    'TheirStack',
    '/logos/theirstack.png',
    'https://theirstack.com/en/docs/api-reference/billing/get_billing_credit_balance_v0',
    'In TheirStack, open Settings, then API Key, and copy it. This reads your API credits; UI credits are not shown.',
    'data',
    'api',
    100,
    true,
    300,
    'https://theirstack.com/en/pricing',
    '[
      {"credit_type":"api_credits","label":"API credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Job postings and technographics API, billed from credits.',
    'https://theirstack.com'
  ),
  (
    'piapi',
    'PiAPI',
    '/logos/piapi.png',
    'https://piapi.ai/docs/account-info-api',
    'In the PiAPI workspace, open API Keys and copy your key. This reads what your remaining credits are worth in USD.',
    'ai',
    'api',
    5,
    true,
    15,
    'https://piapi.ai/pricing',
    '[
      {"credit_type":"wallet","label":"Balance","unit":"usd"}
    ]'::jsonb,
    null,
    'One API for AI media models (Midjourney, Kling, Flux and more), billed from prepaid credits.',
    'https://piapi.ai'
  ),
  (
    'fishaudio',
    'Fish Audio',
    '/logos/fishaudio.png',
    'https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits',
    'In Fish Audio, open API Keys and copy a key. This reads your prepaid API credit, not a plan''s monthly package.',
    'ai',
    'api',
    5,
    true,
    15,
    'https://fish.audio',
    '[
      {"credit_type":"wallet","label":"API credit","unit":"usd"}
    ]'::jsonb,
    null,
    'Text-to-speech and voice cloning API, billed from prepaid API credit.',
    'https://fish.audio'
  ),
  (
    'sumble',
    'Sumble',
    '/logos/sumble.png',
    'https://docs.sumble.com/api/lookups/technologies',
    'In Sumble, open API settings and copy your key. The balance check searches for a technology that does not exist, which Sumble does not charge for.',
    'data',
    'api',
    100,
    true,
    300,
    'https://sumble.com/pricing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Company and technographics intelligence API, billed from credits.',
    'https://sumble.com'
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
