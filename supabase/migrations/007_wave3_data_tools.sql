-- =============================================================================
-- 007_wave3_data_tools.sql
-- Add Wave-3 data/scraping/proxy tools to public.tools.
--
-- These report a prepaid balance readable via a normal API key, now expressible
-- thanks to the `unit` column added in 006:
--   credits: scrapingbee, scraperapi, scrapingdog
--   usd:     brightdata, apify
--
-- ZenRows was evaluated and intentionally excluded: its subscriptions/details
-- endpoint reports only consumption (usage / usage_percent) with no remaining-
-- credit field — a subscription model, not a readable prepaid balance.
--
-- seed.sql also contains these same rows (for fresh local setups). This
-- migration is the one applied to already-provisioned databases. Keep the two
-- in sync if metadata ever changes.
--
-- Idempotent.
-- =============================================================================

insert into public.tools (id, name, logo_url, api_docs_url, key_instructions, category, integration_type, default_alert_threshold, is_active)
values
  ('scrapingbee', 'ScrapingBee', '/logos/scrapingbee.png', 'https://www.scrapingbee.com/documentation/', 'Go to app.scrapingbee.com → Dashboard → copy your API key', 'data', 'api', 250, true),
  ('scraperapi', 'ScraperAPI', '/logos/scraperapi.png', 'https://docs.scraperapi.com/', 'Go to dashboard.scraperapi.com → copy your API key', 'data', 'api', 5000, true),
  ('scrapingdog', 'Scrapingdog', '/logos/scrapingdog.png', 'https://docs.scrapingdog.com/account-api', 'Go to scrapingdog.com → Dashboard → copy your API key', 'data', 'api', 5000, true),
  ('brightdata', 'Bright Data', '/logos/brightdata.png', 'https://docs.brightdata.com/api-reference/account-management-api', 'Go to brightdata.com → Account settings → API tokens → create a token', 'data', 'api', 20, true),
  ('apify', 'Apify', '/logos/apify.png', 'https://docs.apify.com/api/v2', 'Go to console.apify.com → Settings → Integrations → copy your API token', 'data', 'api', 20, true)
on conflict (id) do update set
  name                    = excluded.name,
  logo_url                = excluded.logo_url,
  api_docs_url            = excluded.api_docs_url,
  key_instructions        = excluded.key_instructions,
  category                = excluded.category,
  integration_type        = excluded.integration_type,
  default_alert_threshold = excluded.default_alert_threshold,
  is_active               = excluded.is_active;
