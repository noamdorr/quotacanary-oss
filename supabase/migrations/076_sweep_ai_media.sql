-- 076_sweep_ai_media.sql
-- Balance-endpoint sweep slice A2: AI media vendors (voice, image, video) with
-- a documented read-only balance endpoint, all catalog entries. HeyGen reports
-- one of three pools, picked by the account's billing type; the other two read
-- null and are skipped.
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
    'elevenlabs',
    'ElevenLabs',
    '/logos/elevenlabs.png',
    'https://elevenlabs.io/docs/api-reference/user/subscription/get',
    'In ElevenLabs, go to Developers, then API Keys, and create a key. If you restrict its permissions, keep User read access. Characters count down against your plan''s limit for the billing period.',
    'ai',
    'api',
    1000,
    true,
    3000,
    'https://elevenlabs.io/pricing',
    '[
      {"credit_type":"characters","label":"Characters","unit":"credits"}
    ]'::jsonb,
    null,
    'Text-to-speech and voice AI API, billed against a character quota per billing period.',
    'https://elevenlabs.io'
  ),
  (
    'fal',
    'fal.ai',
    '/logos/fal.png',
    'https://fal.ai/docs/platform-apis/v1/account/billing',
    'In fal, go to Dashboard, then Keys, and create a key with the Read Only, Billing or Full preset (the balance needs billing:usage:read). The balance shows in dollars.',
    'ai',
    'api',
    5,
    true,
    15,
    'https://fal.ai/dashboard/billing',
    '[
      {"credit_type":"credits","label":"Credits","unit":"usd"}
    ]'::jsonb,
    null,
    'Generative media API for image, video and audio models, billed from a prepaid dollar balance.',
    'https://fal.ai'
  ),
  (
    'stability',
    'Stability AI',
    '/logos/stability.png',
    'https://platform.stability.ai/docs/api-reference#tag/User/operation/userBalance',
    'In the Stability AI platform, go to Account, then API Keys, and copy a key (it starts with sk-).',
    'ai',
    'api',
    100,
    true,
    300,
    'https://platform.stability.ai/account/credits',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Stable Diffusion image generation API, billed from prepaid credits.',
    'https://stability.ai'
  ),
  (
    'runway',
    'Runway',
    '/logos/runway.png',
    'https://docs.dev.runwayml.com/api/',
    'In the Runway developer portal, go to API Keys and create a key (it starts with key_). One credit is one cent.',
    'ai',
    'api',
    500,
    true,
    1500,
    'https://dev.runwayml.com',
    '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    null,
    'Video and image generation API, billed from prepaid credits at one cent each.',
    'https://runwayml.com'
  ),
  (
    'heygen',
    'HeyGen',
    '/logos/heygen.png',
    'https://developers.heygen.com/reference/get-current-user',
    'In HeyGen, go to Settings, then API, and copy your API key. Wallet, subscription and usage-based accounts each show their own balance. Enterprise wallets billed in credits are not supported yet.',
    'ai',
    'api',
    10,
    true,
    30,
    'https://www.heygen.com/api-pricing',
    '[
      {"credit_type":"wallet","label":"Wallet","unit":"usd"},
      {"credit_type":"subscription","label":"Premium credits","unit":"credits"},
      {"credit_type":"usage_based","label":"Spending cap","unit":"usd"}
    ]'::jsonb,
    null,
    'AI avatar video API, billed from a wallet, subscription credits or metered spend under a cap.',
    'https://www.heygen.com'
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
