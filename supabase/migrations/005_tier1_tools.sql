-- =============================================================================
-- 005_tier1_tools.sql
-- Add Tier-1 expansion tools to public.tools.
--
-- These are the "simple-key, single-pool" integrations that run on the current
-- schema (one API key per connection, no unit/currency column yet):
--   email verification: zerobounce, bouncer, emailable
--   email finding:      hunter, leadmagic, prospeo, findymail, fullenrich
--   search data:        serpapi
--   ai:                 deepseek, hyperbolic
--
-- seed.sql also contains these same rows (for fresh local setups). This
-- migration is the one applied to already-provisioned databases. Keep the two
-- in sync if metadata ever changes.
--
-- Idempotent.
-- =============================================================================

insert into public.tools (id, name, logo_url, api_docs_url, key_instructions, category, integration_type, default_alert_threshold, is_active)
values
  ('zerobounce', 'ZeroBounce', '/logos/zerobounce.png', 'https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-credit-balance', 'Go to app.zerobounce.net → API → API Keys → copy your API key', 'email_verification', 'api', 1000, true),
  ('bouncer', 'Bouncer', '/logos/bouncer.png', 'https://docs.usebouncer.com/', 'Go to app.usebouncer.com → Settings → API Keys → copy your key', 'email_verification', 'api', 1000, true),
  ('emailable', 'Emailable', '/logos/emailable.png', 'https://emailable.com/docs/api/account/', 'Go to app.emailable.com → API → copy your API key', 'email_verification', 'api', 1000, true),
  ('serpapi', 'SerpApi', '/logos/serpapi.png', 'https://serpapi.com/account-api', 'Go to serpapi.com → Dashboard → Your Account → copy your API key', 'data', 'api', 250, true),
  ('hunter', 'Hunter', '/logos/hunter.png', 'https://hunter.io/api-documentation/v2', 'Go to hunter.io → API → copy your API key', 'email_finding', 'api', 500, true),
  ('leadmagic', 'LeadMagic', '/logos/leadmagic.png', 'https://docs.leadmagic.io/reference/check-credits', 'Go to app.leadmagic.io → API Keys → copy your key', 'email_finding', 'api', 500, true),
  ('prospeo', 'Prospeo', '/logos/prospeo.png', 'https://prospeo.io/api-docs/account-information', 'Go to prospeo.io → API/Integrations → copy your API key', 'email_finding', 'api', 500, true),
  ('findymail', 'Findymail', '/logos/findymail.png', 'https://app.findymail.com/docs/', 'Go to app.findymail.com → Settings → API → copy your key', 'email_finding', 'api', 500, true),
  ('fullenrich', 'FullEnrich', '/logos/fullenrich.png', 'https://docs.fullenrich.com/getcredit', 'Go to app.fullenrich.com → Settings → API → copy your key', 'email_finding', 'api', 500, true),
  ('deepseek', 'DeepSeek', '/logos/deepseek.png', 'https://api-docs.deepseek.com/api/get-user-balance', 'Go to platform.deepseek.com → API Keys → create a key', 'ai', 'api', 5, true),
  ('hyperbolic', 'Hyperbolic', '/logos/hyperbolic.png', 'https://docs.hyperbolic.xyz/', 'Go to app.hyperbolic.ai → Settings → API Keys → copy your key', 'ai', 'api', 5, true)
on conflict (id) do update set
  name                    = excluded.name,
  logo_url                = excluded.logo_url,
  api_docs_url            = excluded.api_docs_url,
  key_instructions        = excluded.key_instructions,
  category                = excluded.category,
  integration_type        = excluded.integration_type,
  default_alert_threshold = excluded.default_alert_threshold,
  is_active               = excluded.is_active;
