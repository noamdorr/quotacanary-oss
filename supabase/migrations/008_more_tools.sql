-- =============================================================================
-- 008_more_tools.sql
-- Add a broad batch of tools that expose a remaining prepaid balance readable
-- via a single API key. Each has a matching adapter under src/lib/adapters/.
--
--   email_verification: emaillistverify, clearout, reoon, myemailverifier,
--                       debounce, bouncify
--   email_finding:      rocketreach, anymailfinder, wiza, surfe, lusha, enrow,
--                       dropcontact
--   data:               valueserp, serpwow, searchapi, zenserp, scrapingant,
--                       scrapfly, captaindata, scrapeops, netnut
--
-- Intentionally excluded (do NOT report a single-key-readable remaining
-- balance): Apollo (consumption-only, needs a master key), DataForSEO / Tomba /
-- Snov.io (require two credentials), PhantomBuster (reports execution time, not
-- a credit/usd/gb balance), Crawlbase (remaining only on some plan types), and
-- tools whose response shape couldn't be verified (Icypeas, ContactOut,
-- Datagma, Skrapp). Same discipline as the ZenRows exclusion in 007.
--
-- seed.sql also contains these same rows (for fresh local setups). This
-- migration is the one applied to already-provisioned databases. Keep the two
-- in sync if metadata ever changes.
--
-- Idempotent.
-- =============================================================================

insert into public.tools (id, name, logo_url, api_docs_url, key_instructions, category, integration_type, default_alert_threshold, is_active)
values
  ('emaillistverify', 'EmailListVerify', '/logos/emaillistverify.png', 'https://www.emaillistverify.com/docs/', 'Go to apps.emaillistverify.com/api → copy your API key', 'email_verification', 'api', 1000, true),
  ('clearout', 'Clearout', '/logos/clearout.png', 'https://docs.clearout.io/developers/api/overview', 'Go to app.clearout.io → Settings → API → generate an API token', 'email_verification', 'api', 1000, true),
  ('reoon', 'Reoon', '/logos/reoon.png', 'https://www.reoon.com/articles/api-documentation-of-reoon-email-verifier/', 'Go to emailverifier.reoon.com → account → copy your API key', 'email_verification', 'api', 1000, true),
  ('myemailverifier', 'MyEmailVerifier', '/logos/myemailverifier.png', 'https://github.com/pat-myemailverifier/myemailverifier-api', 'Go to client.myemailverifier.com → API Settings → copy your API key', 'email_verification', 'api', 1000, true),
  ('debounce', 'DeBounce', '/logos/debounce.png', 'https://developers.debounce.com/api-reference/endpoint/miscellaneous/balance', 'Go to app.debounce.io → API → copy your API key', 'email_verification', 'api', 1000, true),
  ('bouncify', 'Bouncify', '/logos/bouncify.png', 'https://bouncify.io/docs/api-docs/account/', 'Go to bouncify.io → Account → API key → copy your key', 'email_verification', 'api', 1000, true),
  ('rocketreach', 'RocketReach', '/logos/rocketreach.png', 'https://docs.rocketreach.co/reference/rocketreach-api-account', 'Go to rocketreach.co → Settings → API → copy your API key', 'email_finding', 'api', 500, true),
  ('anymailfinder', 'Anymail Finder', '/logos/anymailfinder.png', 'https://anymailfinder.com/email-finder-api/docs/account', 'Go to app.anymailfinder.com → API → copy your API key', 'email_finding', 'api', 500, true),
  ('wiza', 'Wiza', '/logos/wiza.png', 'https://docs.wiza.co/api-reference/credits/get-credits', 'Go to wiza.co → Settings → API → generate an API key', 'email_finding', 'api', 500, true),
  ('surfe', 'Surfe', '/logos/surfe.png', 'https://developers.surfe.com/', 'Go to app.surfe.com → Settings → API → generate an API key', 'email_finding', 'api', 500, true),
  ('lusha', 'Lusha', '/logos/lusha.png', 'https://docs.lusha.com/apis/openapi/account-management/getaccountusagestats', 'Go to dashboard.lusha.com → API → generate your API key', 'email_finding', 'api', 500, true),
  ('enrow', 'Enrow', '/logos/enrow.png', 'https://enrow.readme.io/reference/get-account-info', 'Go to app.enrow.io → API → copy your API key', 'email_finding', 'api', 500, true),
  ('dropcontact', 'Dropcontact', '/logos/dropcontact.png', 'https://developer.dropcontact.com/', 'Go to app.dropcontact.com → API & Integrations → copy your API key', 'email_finding', 'api', 500, true),
  ('valueserp', 'ValueSERP', '/logos/valueserp.png', 'https://docs.trajectdata.com/valueserp/account-api', 'Go to app.valueserp.com → Dashboard → copy your API key', 'data', 'api', 250, true),
  ('serpwow', 'SerpWow', '/logos/serpwow.png', 'https://docs.trajectdata.com/serpwow/account-api', 'Go to app.serpwow.com → Dashboard → copy your API key', 'data', 'api', 250, true),
  ('searchapi', 'SearchApi', '/logos/searchapi.png', 'https://www.searchapi.io/docs/account-api', 'Go to searchapi.io → Dashboard → API Key → copy your key', 'data', 'api', 250, true),
  ('zenserp', 'Zenserp', '/logos/zenserp.png', 'https://app.zenserp.com/documentation', 'Go to app.zenserp.com → Dashboard → copy your apikey', 'data', 'api', 250, true),
  ('scrapingant', 'ScrapingAnt', '/logos/scrapingant.png', 'https://docs.scrapingant.com/api-credits-usage', 'Go to app.scrapingant.com/dashboard → copy your API key', 'data', 'api', 5000, true),
  ('scrapfly', 'Scrapfly', '/logos/scrapfly.png', 'https://scrapfly.io/docs/account', 'Go to scrapfly.io/dashboard → copy your API key', 'data', 'api', 5000, true),
  ('captaindata', 'Captain Data', '/logos/captaindata.png', 'https://docs.captaindata.com/v1/api/quotas', 'Go to app.captaindata.com/developers → copy your API key', 'data', 'api', 250, true),
  ('scrapeops', 'ScrapeOps', '/logos/scrapeops.png', 'https://scrapeops.io/docs/web-scraping-proxy-api-aggregator/account/usage-endpoint/', 'Go to scrapeops.io → Dashboard → API key → copy your key', 'data', 'api', 5000, true),
  ('netnut', 'NetNut', '/logos/netnut.png', 'https://help.netnut.io/netnut-documentation/resources/customers-api/usage', 'Go to netnut.io → Dashboard → Customers API → copy your API key', 'data', 'api', 50, true)
on conflict (id) do update set
  name                    = excluded.name,
  logo_url                = excluded.logo_url,
  api_docs_url            = excluded.api_docs_url,
  key_instructions        = excluded.key_instructions,
  category                = excluded.category,
  integration_type        = excluded.integration_type,
  default_alert_threshold = excluded.default_alert_threshold,
  is_active               = excluded.is_active;
