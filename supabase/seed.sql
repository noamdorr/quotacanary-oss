-- =============================================================================
-- seed.sql
-- QuotaCanary seed data — Tier 1 tool metadata
-- Phase 1: Foundation
-- =============================================================================
-- Run after migrations to populate the tools reference table.
-- Additional tools (Hunter, Prospeo) added in Phase 2 when integrations built.

insert into public.tools (id, name, logo_url, api_docs_url, key_instructions, category, integration_type, default_alert_threshold, is_active)
values
  (
    'neverbounce',
    'NeverBounce',
    '/logos/neverbounce.png',
    'https://developers.neverbounce.com',
    'Go to app.neverbounce.com → Settings → API → Copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'millionverifier',
    'MillionVerifier',
    '/logos/millionverifier.png',
    'https://millionverifier.com/api',
    'Go to app.millionverifier.com → API → Copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'openrouter',
    'OpenRouter',
    '/logos/openrouter.png',
    'https://openrouter.ai/docs/api-reference',
    'Go to openrouter.ai → Settings → API Keys → Create a management key',
    'ai',
    'api',
    5,
    true
  ),
  (
    'zerobounce',
    'ZeroBounce',
    '/logos/zerobounce.png',
    'https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-credit-balance',
    'Go to app.zerobounce.net → API → API Keys → copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'bouncer',
    'Bouncer',
    '/logos/bouncer.png',
    'https://docs.usebouncer.com/',
    'Go to app.usebouncer.com → Settings → API Keys → copy your key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'emailable',
    'Emailable',
    '/logos/emailable.png',
    'https://emailable.com/docs/api/account/',
    'Go to app.emailable.com → API → copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'mailercheck',
    'MailerCheck',
    '/logos/mailercheck.png',
    'https://developers.mailercheck.com/account',
    'Go to MailerCheck -> Profile -> API -> Create token',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'emailhippo',
    'Email Hippo',
    '/logos/emailhippo.png',
    'https://help.emailhippo.com/how-to-check-your-more-api-quota-using-the-api',
    'Go to Email Hippo -> MORE -> API Keys and copy your license key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'serpapi',
    'SerpApi',
    '/logos/serpapi.png',
    'https://serpapi.com/account-api',
    'Go to serpapi.com → Dashboard → Your Account → copy your API key',
    'data',
    'api',
    250,
    true
  ),
  (
    'hunter',
    'Hunter',
    '/logos/hunter.png',
    'https://hunter.io/api-documentation/v2',
    'Go to hunter.io → API → copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'leadmagic',
    'LeadMagic',
    '/logos/leadmagic.png',
    'https://docs.leadmagic.io/reference/check-credits',
    'Go to app.leadmagic.io → API Keys → copy your key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'prospeo',
    'Prospeo',
    '/logos/prospeo.png',
    'https://prospeo.io/api-docs/account-information',
    'Go to prospeo.io → API/Integrations → copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'findymail',
    'Findymail',
    '/logos/findymail.png',
    'https://app.findymail.com/docs/',
    'Go to app.findymail.com → Settings → API → copy your key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'fullenrich',
    'FullEnrich',
    '/logos/fullenrich.png',
    'https://docs.fullenrich.com/getcredit',
    'Go to app.fullenrich.com → Settings → API → copy your key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'enrichcrm',
    'Enrich CRM',
    '/logos/enrichcrm.png',
    'https://enrich-crm.readme.io/reference/getremainingcredits',
    'Go to Enrich CRM -> API settings and copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'skrapp',
    'Skrapp',
    '/logos/skrapp.png',
    'https://skrapp.io/api',
    'Go to Skrapp Account Settings -> API Access Key and copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'deepseek',
    'DeepSeek',
    '/logos/deepseek.png',
    'https://api-docs.deepseek.com/api/get-user-balance',
    'Go to platform.deepseek.com → API Keys → create a key',
    'ai',
    'api',
    5,
    true
  ),
  (
    'hyperbolic',
    'Hyperbolic',
    '/logos/hyperbolic.png',
    'https://docs.hyperbolic.xyz/',
    'Go to app.hyperbolic.ai → Settings → API Keys → copy your key',
    'ai',
    'api',
    5,
    true
  ),
  (
    'meltly',
    'Melt.ly',
    '/logos/meltly.png',
    'https://melt.ly/docs',
    'Go to Melt.ly -> API key and copy your API key',
    'ai',
    'api',
    5,
    true
  ),
  (
    'scrapingbee',
    'ScrapingBee',
    '/logos/scrapingbee.png',
    'https://www.scrapingbee.com/documentation/',
    'Go to app.scrapingbee.com → Dashboard → copy your API key',
    'data',
    'api',
    250,
    true
  ),
  (
    'scraperapi',
    'ScraperAPI',
    '/logos/scraperapi.png',
    'https://docs.scraperapi.com/',
    'Go to dashboard.scraperapi.com → copy your API key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'scrapingdog',
    'Scrapingdog',
    '/logos/scrapingdog.png',
    'https://docs.scrapingdog.com/account-api',
    'Go to scrapingdog.com → Dashboard → copy your API key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'brightdata',
    'Bright Data',
    '/logos/brightdata.png',
    'https://docs.brightdata.com/api-reference/account-management-api',
    'Go to brightdata.com → Account settings → API tokens → create a token',
    'data',
    'api',
    20,
    true
  ),
  (
    'apify',
    'Apify',
    '/logos/apify.png',
    'https://docs.apify.com/api/v2',
    'Go to console.apify.com → Settings → Integrations → copy your API token',
    'data',
    'api',
    20,
    true
  ),
  (
    'firecrawl',
    'Firecrawl',
    '/logos/firecrawl.png',
    'https://docs.firecrawl.dev/api-reference/endpoint/credit-usage',
    'Go to Firecrawl dashboard → API Keys → copy your API key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'tavily',
    'Tavily',
    '/logos/tavily.png',
    'https://docs.tavily.com/documentation/api-reference/endpoint/usage',
    'Go to app.tavily.com -> API Keys and copy your API key',
    'data',
    'api',
    100,
    true
  ),
  (
    'scrapegraphai',
    'ScrapeGraphAI',
    '/logos/scrapegraphai.png',
    'https://docs.scrapegraphai.com/api-reference/endpoint/credits',
    'Go to ScrapeGraphAI -> Dashboard -> API Keys and copy your API key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'dataforseo',
    'DataForSEO',
    '/logos/dataforseo.png',
    'https://docs.dataforseo.com/v3/appendix-user-data/',
    'Go to DataForSEO Dashboard -> API Access and copy your API login and API password',
    'data',
    'api',
    25,
    true
  ),
  (
    'ahrefs',
    'Ahrefs',
    '/logos/ahrefs.png',
    'https://docs.ahrefs.com/en/api/reference/subscription-info/get-limits-and-usage',
    'Go to Ahrefs -> Account settings -> API and copy your API key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'semrush',
    'Semrush',
    '/logos/semrush.png',
    'https://developer.semrush.com/api/get-started/api-units-balance/',
    'Go to Semrush -> Subscription info -> API units and copy your API key',
    'data',
    'api',
    1000,
    true
  ),
  (
    'emaillistverify',
    'EmailListVerify',
    '/logos/emaillistverify.png',
    'https://www.emaillistverify.com/docs/',
    'Go to apps.emaillistverify.com/api → copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'clearout',
    'Clearout',
    '/logos/clearout.png',
    'https://docs.clearout.io/developers/api/overview',
    'Go to app.clearout.io → Settings → API → generate an API token',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'reoon',
    'Reoon',
    '/logos/reoon.png',
    'https://www.reoon.com/articles/api-documentation-of-reoon-email-verifier/',
    'Go to emailverifier.reoon.com → account → copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'myemailverifier',
    'MyEmailVerifier',
    '/logos/myemailverifier.png',
    'https://github.com/pat-myemailverifier/myemailverifier-api',
    'Go to client.myemailverifier.com → API Settings → copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'debounce',
    'DeBounce',
    '/logos/debounce.png',
    'https://developers.debounce.com/api-reference/endpoint/miscellaneous/balance',
    'Go to app.debounce.io → API → copy your API key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'bouncify',
    'Bouncify',
    '/logos/bouncify.png',
    'https://bouncify.io/docs/api-docs/account/',
    'Go to bouncify.io → Account → API key → copy your key',
    'email_verification',
    'api',
    1000,
    true
  ),
  (
    'rocketreach',
    'RocketReach',
    '/logos/rocketreach.png',
    'https://docs.rocketreach.co/reference/rocketreach-api-account',
    'Go to rocketreach.co → Settings → API → copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'anymailfinder',
    'Anymail Finder',
    '/logos/anymailfinder.png',
    'https://anymailfinder.com/email-finder-api/docs/account',
    'Go to app.anymailfinder.com → API → copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'wiza',
    'Wiza',
    '/logos/wiza.png',
    'https://docs.wiza.co/api-reference/credits/get-credits',
    'Go to wiza.co → Settings → API → generate an API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'surfe',
    'Surfe',
    '/logos/surfe.png',
    'https://developers.surfe.com/',
    'Go to app.surfe.com → Settings → API → generate an API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'lusha',
    'Lusha',
    '/logos/lusha.png',
    'https://docs.lusha.com/apis/openapi/account-management/getaccountusagestats',
    'Go to dashboard.lusha.com → API → generate your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'enrow',
    'Enrow',
    '/logos/enrow.png',
    'https://enrow.readme.io/reference/get-account-info',
    'Go to app.enrow.io → API → copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'dropcontact',
    'Dropcontact',
    '/logos/dropcontact.png',
    'https://developer.dropcontact.com/',
    'Go to app.dropcontact.com → API & Integrations → copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'valueserp',
    'ValueSERP',
    '/logos/valueserp.png',
    'https://docs.trajectdata.com/valueserp/account-api',
    'Go to app.valueserp.com → Dashboard → copy your API key',
    'data',
    'api',
    250,
    true
  ),
  (
    'serpwow',
    'SerpWow',
    '/logos/serpwow.png',
    'https://docs.trajectdata.com/serpwow/account-api',
    'Go to app.serpwow.com → Dashboard → copy your API key',
    'data',
    'api',
    250,
    true
  ),
  (
    'searchapi',
    'SearchApi',
    '/logos/searchapi.png',
    'https://www.searchapi.io/docs/account-api',
    'Go to searchapi.io → Dashboard → API Key → copy your key',
    'data',
    'api',
    250,
    true
  ),
  (
    'zenserp',
    'Zenserp',
    '/logos/zenserp.png',
    'https://app.zenserp.com/documentation',
    'Go to app.zenserp.com → Dashboard → copy your apikey',
    'data',
    'api',
    250,
    true
  ),
  (
    'scrapingant',
    'ScrapingAnt',
    '/logos/scrapingant.png',
    'https://docs.scrapingant.com/api-credits-usage',
    'Go to app.scrapingant.com/dashboard → copy your API key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'scrapfly',
    'Scrapfly',
    '/logos/scrapfly.png',
    'https://scrapfly.io/docs/account',
    'Go to scrapfly.io/dashboard → copy your API key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'captaindata',
    'Captain Data',
    '/logos/captaindata.png',
    'https://docs.captaindata.com/v1/api/quotas',
    'Go to app.captaindata.com/developers → copy your API key',
    'data',
    'api',
    250,
    true
  ),
  (
    'scrapeops',
    'ScrapeOps',
    '/logos/scrapeops.png',
    'https://scrapeops.io/docs/web-scraping-proxy-api-aggregator/account/usage-endpoint/',
    'Go to scrapeops.io → Dashboard → API key → copy your key',
    'data',
    'api',
    5000,
    true
  ),
  (
    'netnut',
    'NetNut',
    '/logos/netnut.png',
    'https://help.netnut.io/netnut-documentation/resources/customers-api/usage',
    'Go to netnut.io → Dashboard → Customers API → copy your API key',
    'data',
    'api',
    50,
    true
  ),
  (
    'outscraper',
    'Outscraper',
    '/logos/outscraper.png',
    'https://docs.outscraper.com/endpoints/profile-balance/',
    'Go to Outscraper -> Profile -> API Key and copy your API key',
    'data',
    'api',
    25,
    true
  ),
  (
    'orthogonal',
    'Orthogonal',
    '/logos/orthogonal.png',
    'https://docs.orthogonal.com/api-reference/balance',
    'Go to Orthogonal -> Dashboard -> API Keys and copy your API key',
    'data',
    'api',
    5,
    true
  ),
  (
    'tomba',
    'Tomba',
    '/logos/tomba.png',
    'https://docs.tomba.io/api/account',
    'Go to Tomba -> Dashboard -> API Keys and copy your API key and API secret',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'snov',
    'Snov.io',
    '/logos/snov.png',
    'https://snov.io/api',
    'Go to Snov.io -> Account -> API and copy your API User ID and API Secret',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'contactout',
    'ContactOut',
    '/logos/contactout.png',
    'https://api.contactout.com/#api-usage-stats',
    'Go to ContactOut -> API and copy your API token',
    'email_finding',
    'api',
    100,
    true
  ),
  (
    'oppora',
    'Oppora',
    '/logos/oppora.png',
    'https://oppora.ai/docs/api#/Credits',
    'Go to Oppora -> Integrations -> Oppora API -> New key and copy the secret',
    'email_finding',
    'api',
    100,
    true
  ),
  (
    'proxycurl',
    'Proxycurl',
    '/logos/proxycurl.png',
    'https://nubela.co/proxycurl/docs#view-credit-balance-endpoint',
    'Go to Proxycurl dashboard -> API and copy your API key',
    'data',
    'api',
    100,
    true
  ),
  (
    'bettercontact',
    'BetterContact',
    '/logos/bettercontact.png',
    'https://doc.bettercontact.rocks/api-reference/endpoint/account',
    'Go to BetterContact -> Settings -> API and copy your API key',
    'email_finding',
    'api',
    500,
    true
  ),
  (
    'shodan',
    'Shodan',
    '/logos/shodan.png',
    'https://developer.shodan.io/api',
    'Go to account.shodan.io -> Account -> API key and copy your key',
    'data',
    'api',
    25,
    true
  ),
  (
    'verifalia',
    'Verifalia',
    '/logos/verifalia.png',
    'https://verifalia.com/developers/credits',
    'Go to Verifalia -> Client area -> Users or API credentials and copy your username and password',
    'email_verification',
    'api',
    1000,
    true
  )
on conflict (id) do update set
  name                    = excluded.name,
  logo_url                = excluded.logo_url,
  api_docs_url            = excluded.api_docs_url,
  key_instructions        = excluded.key_instructions,
  category                = excluded.category,
  integration_type        = excluded.integration_type,
  default_alert_threshold = excluded.default_alert_threshold,
  is_active               = excluded.is_active;

-- Multi-pool: Hunter exposes searches + verifications.
update public.tools
  set
    topup_url = 'https://hunter.io/billing',
    pools = '[
    {"credit_type":"searches","label":"Searches","unit":"credits"},
    {"credit_type":"verifications","label":"Verifications","unit":"credits"}
  ]'::jsonb
  where id = 'hunter';

-- DataForSEO uses HTTP Basic auth with an API login + API password.
update public.tools
  set
    default_low_threshold = 75,
    topup_url = 'https://app.dataforseo.com/',
    pools = '[
      {"credit_type":"balance","label":"Account Balance","unit":"usd"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"login","label":"API login","type":"text"},
      {"name":"password","label":"API password","type":"password"}
    ]'::jsonb
  where id = 'dataforseo';

-- Ahrefs exposes monthly API units for a workspace, optionally constrained by
-- the connected API key's own monthly cap.
update public.tools
  set
    default_low_threshold = 15000,
    topup_url = 'https://app.ahrefs.com/account/subscription',
    pools = '[
      {"credit_type":"units","label":"API Units","unit":"credits"}
    ]'::jsonb
  where id = 'ahrefs';

-- Semrush exposes remaining Standard API units.
update public.tools
  set
    default_low_threshold = 3000,
    topup_url = 'https://www.semrush.com/billing-admin/profile/subscription/api-units',
    pools = '[
      {"credit_type":"units","label":"API Units","unit":"credits"}
    ]'::jsonb
  where id = 'semrush';

-- Firecrawl exposes one team credits pool.
update public.tools
  set default_low_threshold = 15000
  where id = 'firecrawl';

-- Tavily exposes plan credits plus optional pay-as-you-go and API-key caps.
update public.tools
  set
    default_low_threshold = 300,
    topup_url = 'https://app.tavily.com/billing',
    pools = '[
      {"credit_type":"plan","label":"Plan Credits","unit":"credits"},
      {"credit_type":"paygo","label":"Pay-as-you-go Credits","unit":"credits"},
      {"credit_type":"key","label":"API Key Credits","unit":"credits"}
    ]'::jsonb
  where id = 'tavily';

-- Melt.ly exposes subscription and pay-as-you-go credits.
update public.tools
  set
    default_low_threshold = 15,
    topup_url = 'https://melt.ly',
    pools = '[
      {"credit_type":"subscription","label":"Subscription Credits","unit":"credits"},
      {"credit_type":"payg","label":"Pay-as-you-go Credits","unit":"credits"}
    ]'::jsonb
  where id = 'meltly';

-- ScrapeGraphAI exposes one account credits pool.
update public.tools
  set default_low_threshold = 15000
  where id = 'scrapegraphai';

-- Email Hippo reports quota remaining/used through the MORE API.
update public.tools
  set pools = '[
    {"credit_type":"quota","label":"Quota","unit":"credits"}
  ]'::jsonb
  where id = 'emailhippo';

-- Outscraper and Orthogonal expose one USD balance pool.
update public.tools
  set
    default_low_threshold = 75,
    topup_url = 'https://app.outscraper.com/billing'
  where id = 'outscraper';

update public.tools
  set
    default_low_threshold = 15,
    topup_url = 'https://orthogonal.com/dashboard/balance'
  where id = 'orthogonal';

-- Tomba uses an API key plus API secret and returns several prospecting pools.
update public.tools
  set
    topup_url = 'https://app.tomba.io/billing',
    pools = '[
      {"credit_type":"searches","label":"Searches","unit":"credits"},
      {"credit_type":"verifications","label":"Verifications","unit":"credits"},
      {"credit_type":"phones","label":"Phones","unit":"credits"},
      {"credit_type":"b2b","label":"B2B","unit":"credits"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"key","label":"API key","type":"text"},
      {"name":"secret","label":"API secret","type":"password"}
    ]'::jsonb
  where id = 'tomba';

-- Snov.io uses OAuth client credentials before reading account credits.
update public.tools
  set
    default_low_threshold = 1500,
    topup_url = 'https://app.snov.io/billing',
    credential_fields = '[
      {"name":"clientId","label":"API User ID","type":"text"},
      {"name":"clientSecret","label":"API Secret","type":"password"}
    ]'::jsonb
  where id = 'snov';

-- ContactOut exposes separate monthly email, phone, and search credit pools.
update public.tools
  set
    default_low_threshold = 300,
    topup_url = 'https://contactout.com/pricing',
    pools = '[
      {"credit_type":"email","label":"Email Credits","unit":"credits"},
      {"credit_type":"phone","label":"Phone Credits","unit":"credits"},
      {"credit_type":"search","label":"Search Credits","unit":"credits"}
    ]'::jsonb
  where id = 'contactout';

-- Oppora exposes separate data and phone credit pools.
update public.tools
  set
    default_low_threshold = 300,
    topup_url = 'https://oppora.ai/pricing',
    pools = '[
      {"credit_type":"data","label":"Data Credits","unit":"credits"},
      {"credit_type":"phone","label":"Phone Credits","unit":"credits"}
    ]'::jsonb
  where id = 'oppora';

-- Proxycurl exposes one shared API credit balance.
update public.tools
  set
    default_low_threshold = 300,
    topup_url = 'https://nubela.co/proxycurl/pricing'
  where id = 'proxycurl';

-- BetterContact exposes one shared contact enrichment credits pool.
update public.tools
  set
    default_low_threshold = 1500,
    topup_url = 'https://app.bettercontact.rocks',
    pools = '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb
  where id = 'bettercontact';

-- Enrich CRM exposes one shared CRM enrichment credits pool.
update public.tools
  set
    default_low_threshold = 1500,
    topup_url = 'https://app.enrich-crm.com',
    pools = '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb
  where id = 'enrichcrm';

-- Skrapp exposes monthly email credit quota and used counts.
update public.tools
  set
    default_low_threshold = 1500,
    topup_url = 'https://skrapp.io/pricing',
    pools = '[
      {"credit_type":"email","label":"Email Credits","unit":"credits"}
    ]'::jsonb
  where id = 'skrapp';

-- Shodan exposes separate query and on-demand scan credit pools.
update public.tools
  set
    default_low_threshold = 75,
    topup_url = 'https://account.shodan.io/billing',
    pools = '[
      {"credit_type":"query","label":"Query Credits","unit":"credits"},
      {"credit_type":"scan","label":"Scan Credits","unit":"credits"}
    ]'::jsonb
  where id = 'shodan';

-- Verifalia uses HTTP Basic auth and may expose daily free credits.
update public.tools
  set
    default_low_threshold = 3000,
    topup_url = 'https://verifalia.com/client-area',
    pools = '[
      {"credit_type":"credit_packs","label":"Credit Packs","unit":"credits"},
      {"credit_type":"free_daily","label":"Free Daily Credits","unit":"credits"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"username","label":"API username","type":"text"},
      {"name":"password","label":"API password","type":"password"}
    ]'::jsonb
  where id = 'verifalia';

-- ---------------------------------------------------------------------------
-- Tool directory descriptions (public /directory pages). First draft; refine
-- voice freely. Kept out of the insert block above so re-seeding never clears
-- them.
-- ---------------------------------------------------------------------------
update public.tools set description = 'Real-time and bulk email verification, priced per verification credit.' where id = 'neverbounce';
update public.tools set description = 'Bulk email list verification with a pay-as-you-go credit balance.' where id = 'millionverifier';
update public.tools set description = 'Email verification, scoring, and data appends, billed per credit.' where id = 'zerobounce';
update public.tools set description = 'Email verification and deliverability checks, priced per credit.' where id = 'bouncer';
update public.tools set description = 'Email verification for lists and real-time signups, billed per credit.' where id = 'emailable';
update public.tools set description = 'Bulk and real-time email list verification, priced per credit.' where id = 'emaillistverify';
update public.tools set description = 'Email verification and finding from a shared credit balance.' where id = 'clearout';
update public.tools set description = 'Email verification with fast bulk processing, billed per credit.' where id = 'reoon';
update public.tools set description = 'Bulk and real-time email verification, priced per credit.' where id = 'myemailverifier';
update public.tools set description = 'Email list cleaning and verification, billed per credit.' where id = 'debounce';
update public.tools set description = 'Bulk email verification, priced per verification credit.' where id = 'bouncify';
update public.tools set description = 'Email verification and quota checks for the MORE API, billed from a credit balance.' where id = 'emailhippo';
update public.tools set description = 'Email verification and list cleaning from MailerLite, priced per verification credit.' where id = 'mailercheck';
update public.tools set description = 'Find and verify professional email addresses. Bills searches and verifications as separate quotas.' where id = 'hunter';
update public.tools set description = 'B2B email finding and enrichment, priced per credit.' where id = 'leadmagic';
update public.tools set description = 'Email and phone finding for B2B prospecting, billed per credit.' where id = 'prospeo';
update public.tools set description = 'Verified email finding for outreach, priced per credit.' where id = 'findymail';
update public.tools set description = 'Waterfall contact enrichment across providers, billed per credit.' where id = 'fullenrich';
update public.tools set description = 'Real-time CRM enrichment and intent data, billed from a shared credit pool.' where id = 'enrichcrm';
update public.tools set description = 'B2B email finding and verification for outreach, billed from monthly email credits.' where id = 'skrapp';
update public.tools set description = 'Contact and company lookups, priced per lookup credit.' where id = 'rocketreach';
update public.tools set description = 'Email finding that charges only for verified results, billed per credit.' where id = 'anymailfinder';
update public.tools set description = 'Email and phone finding from LinkedIn searches, priced per credit.' where id = 'wiza';
update public.tools set description = 'Contact data and enrichment inside your CRM, billed per credit.' where id = 'surfe';
update public.tools set description = 'B2B contact and company data, priced per credit.' where id = 'lusha';
update public.tools set description = 'Email finding and verification for outreach, billed per credit.' where id = 'enrow';
update public.tools set description = 'Email finding and B2B enrichment without a database, priced per credit.' where id = 'dropcontact';
update public.tools set description = 'Email finding and verification for B2B outreach, billed from account credits.' where id = 'tomba';
update public.tools set description = 'Email finding, verification, and outreach automation, billed from account credits.' where id = 'snov';
update public.tools set description = 'B2B contact data and people search, with separate email, phone, and search credit pools.' where id = 'contactout';
update public.tools set description = 'Outbound sales automation with contact discovery and phone lookup, billed from data and phone credit pools.' where id = 'oppora';
update public.tools set description = 'Waterfall contact enrichment for email and phone, billed from account credits.' where id = 'bettercontact';
update public.tools set description = 'Search engine results as structured data, priced per search.' where id = 'serpapi';
update public.tools set description = 'Web scraping API with proxies and headless rendering, billed per credit.' where id = 'scrapingbee';
update public.tools set description = 'Web scraping with rotating proxies, priced per API credit.' where id = 'scraperapi';
update public.tools set description = 'Web and search scraping API, billed per request credit.' where id = 'scrapingdog';
update public.tools set description = 'Proxies and web data at scale, billed by usage balance.' where id = 'brightdata';
update public.tools set description = 'A platform of scrapers and automations, billed from a prepaid balance.' where id = 'apify';
update public.tools set description = 'Turn websites into clean, LLM-ready data, priced per credit.' where id = 'firecrawl';
update public.tools set description = 'Search, extraction, crawl, and research APIs for AI agents, billed from API credits.' where id = 'tavily';
update public.tools set description = 'SEO and SERP data APIs, billed from a prepaid balance.' where id = 'dataforseo';
update public.tools set description = 'SEO data and backlink intelligence APIs, billed from monthly API units.' where id = 'ahrefs';
update public.tools set description = 'SEO and competitive intelligence APIs, billed from API units.' where id = 'semrush';
update public.tools set description = 'Google search results as an API, priced per search credit.' where id = 'valueserp';
update public.tools set description = 'Search engine results across engines, billed per credit.' where id = 'serpwow';
update public.tools set description = 'Real-time SERP and search data API, priced per search.' where id = 'searchapi';
update public.tools set description = 'SERP scraping API across search engines, billed per request.' where id = 'zenserp';
update public.tools set description = 'Web scraping with headless browsers and proxies, priced per credit.' where id = 'scrapingant';
update public.tools set description = 'Web scraping API with anti-bot bypass, billed per credit.' where id = 'scrapfly';
update public.tools set description = 'No-code data extraction and automation, priced per credit.' where id = 'captaindata';
update public.tools set description = 'Proxy aggregation and scraping monitoring, billed per request.' where id = 'scrapeops';
update public.tools set description = 'Residential and static proxies, billed by traffic balance.' where id = 'netnut';
update public.tools set description = 'Maps, reviews, and web data extraction, billed from a prepaid balance.' where id = 'outscraper';
update public.tools set description = 'AI-powered web scraping and extraction, priced per credit.' where id = 'scrapegraphai';
update public.tools set description = 'Data and enrichment API usage, billed from a credit balance.' where id = 'orthogonal';
update public.tools set description = 'LinkedIn and company data APIs, billed from a shared API credit balance.' where id = 'proxycurl';
update public.tools set description = 'Internet intelligence and search APIs, billed from query and scan credits.' where id = 'shodan';
update public.tools set description = 'One API for many LLMs, drawn from a prepaid credit balance.' where id = 'openrouter';
update public.tools set description = 'DeepSeek''s LLM API, billed from a prepaid balance.' where id = 'deepseek';
update public.tools set description = 'Open-model inference and GPUs, billed from a prepaid balance.' where id = 'hyperbolic';
update public.tools set description = 'AI sales research and icebreaker generation, billed from subscription and pay-as-you-go credits.' where id = 'meltly';
update public.tools set description = 'Email verification and list cleaning, billed from credit packs and optional free daily credits.' where id = 'verifalia';

-- ---------------------------------------------------------------------------
-- Tool homepages (directory "Website" button + JSON-LD url). Only seeded where
-- toolWebsiteUrl()'s derive-from-URL heuristic is wrong (docs on a third-party
-- domain, or a non-root subdomain). Every other tool derives correctly.
-- ---------------------------------------------------------------------------
update public.tools set website_url = 'https://deepseek.com' where id = 'deepseek';
update public.tools set website_url = 'https://myemailverifier.com' where id = 'myemailverifier';
update public.tools set website_url = 'https://enrow.io' where id = 'enrow';
update public.tools set website_url = 'https://serpwow.com' where id = 'serpwow';
update public.tools set website_url = 'https://valueserp.com' where id = 'valueserp';
update public.tools set website_url = 'https://contactout.com' where id = 'contactout';
update public.tools set website_url = 'https://nubela.co/proxycurl' where id = 'proxycurl';
update public.tools set website_url = 'https://ahrefs.com' where id = 'ahrefs';
update public.tools set website_url = 'https://www.semrush.com' where id = 'semrush';
update public.tools set website_url = 'https://tavily.com' where id = 'tavily';
update public.tools set website_url = 'https://melt.ly' where id = 'meltly';
update public.tools set website_url = 'https://bettercontact.rocks' where id = 'bettercontact';
update public.tools set website_url = 'https://shodan.io' where id = 'shodan';
update public.tools set website_url = 'https://enrich-crm.com' where id = 'enrichcrm';
update public.tools set website_url = 'https://skrapp.io' where id = 'skrapp';
update public.tools set website_url = 'https://oppora.ai' where id = 'oppora';

-- ---------------------------------------------------------------------------
-- Top-up URLs for fresh installs. Migrations 034/035 backfilled these on the
-- hosted DB, but migrations run before seed inserts the tools, so on a clean
-- db reset those updates no-op. This block mirrors their final state (034
-- with 035's three corrections); research notes live in the migrations.
-- ---------------------------------------------------------------------------
update public.tools set topup_url = 'https://platform.deepseek.com/top_up' where id = 'deepseek';
update public.tools set topup_url = 'https://app.hyperbolic.ai/settings/billing' where id = 'hyperbolic';
update public.tools set topup_url = 'https://anymailfinder.com/pricing' where id = 'anymailfinder';
update public.tools set topup_url = 'https://app.dropcontact.com/billing' where id = 'dropcontact';
update public.tools set topup_url = 'https://enrow.io/pricing' where id = 'enrow';
update public.tools set topup_url = 'https://www.findymail.com/pricing/' where id = 'findymail';
update public.tools set topup_url = 'https://app.fullenrich.com/app/settings/billing' where id = 'fullenrich';
update public.tools set topup_url = 'https://app.leadmagic.io/settings/billing' where id = 'leadmagic';
update public.tools set topup_url = 'https://dashboard.lusha.com/account' where id = 'lusha';
update public.tools set topup_url = 'https://app.prospeo.io/account/subscription' where id = 'prospeo';
update public.tools set topup_url = 'https://rocketreach.co/pricing' where id = 'rocketreach';
update public.tools set topup_url = 'https://app.surfe.com/lighthouse/home?open-buy-credits=true' where id = 'surfe';
update public.tools set topup_url = 'https://wiza.co/app/settings/billing' where id = 'wiza';
update public.tools set topup_url = 'https://www.usebouncer.com/pricing/' where id = 'bouncer';
update public.tools set topup_url = 'https://bouncify.io/pricing.html' where id = 'bouncify';
update public.tools set topup_url = 'https://app.clearout.io/public/credits' where id = 'clearout';
update public.tools set topup_url = 'https://debounce.com/pricing/' where id = 'debounce';
update public.tools set topup_url = 'https://app.emailable.com/checkout/credits' where id = 'emailable';
update public.tools set topup_url = 'https://app.emailhippo.com/' where id = 'emailhippo';
update public.tools set topup_url = 'https://app.emaillistverify.com/signin' where id = 'emaillistverify';
update public.tools set topup_url = 'https://app.mailercheck.com/' where id = 'mailercheck';
update public.tools set topup_url = 'https://client.myemailverifier.com/login?buyCredit=10000' where id = 'myemailverifier';
update public.tools set topup_url = 'https://emailverifier.reoon.com/' where id = 'reoon';
update public.tools set topup_url = 'https://www.zerobounce.net/members/pricing' where id = 'zerobounce';
update public.tools set topup_url = 'https://console.apify.com/billing/subscription' where id = 'apify';
update public.tools set topup_url = 'https://brightdata.com/cp/billing' where id = 'brightdata';
update public.tools set topup_url = 'https://app.captaindata.com/settings/plans' where id = 'captaindata';
update public.tools set topup_url = 'https://www.firecrawl.dev/pricing' where id = 'firecrawl';
update public.tools set topup_url = 'https://dashboard.netnut.io' where id = 'netnut';
update public.tools set topup_url = 'https://scrapegraphai.com/pricing' where id = 'scrapegraphai';
update public.tools set topup_url = 'https://scrapeops.io/app/login/' where id = 'scrapeops';
update public.tools set topup_url = 'https://dashboard.scraperapi.com/billing' where id = 'scraperapi';
update public.tools set topup_url = 'https://scrapfly.io/dashboard/billing' where id = 'scrapfly';
update public.tools set topup_url = 'https://app.scrapingant.com/dashboard' where id = 'scrapingant';
update public.tools set topup_url = 'https://app.scrapingbee.com/billing/plans' where id = 'scrapingbee';
update public.tools set topup_url = 'https://www.scrapingdog.com/pricing/' where id = 'scrapingdog';
update public.tools set topup_url = 'https://www.searchapi.io/pricing' where id = 'searchapi';
update public.tools set topup_url = 'https://serpapi.com/change-plan' where id = 'serpapi';
update public.tools set topup_url = 'https://app.serpwow.com/' where id = 'serpwow';
update public.tools set topup_url = 'https://app.valueserp.com/' where id = 'valueserp';
update public.tools set topup_url = 'https://zenserp.com/pricing-plans/' where id = 'zenserp';

-- ---------------------------------------------------------------------------
-- Pools for the multi-pool tools declared in migration 037 (same
-- migrations-run-before-seed problem as above). credit_type, label, and unit
-- mirror each adapter's readBalance output exactly.
-- ---------------------------------------------------------------------------
update public.tools
  set pools = '[
    {"credit_type":"ondemand","label":"Credits","unit":"credits"},
    {"credit_type":"subscription","label":"Daily Credits","unit":"credits"}
  ]'::jsonb
  where id = 'emaillistverify';

update public.tools
  set pools = '[
    {"credit_type":"instant","label":"Credits","unit":"credits"},
    {"credit_type":"daily","label":"Daily Credits","unit":"credits"}
  ]'::jsonb
  where id = 'reoon';

update public.tools
  set pools = '[
    {"credit_type":"email","label":"Email Credits","unit":"credits"},
    {"credit_type":"mobile","label":"Mobile Credits","unit":"credits"},
    {"credit_type":"search","label":"Search Credits","unit":"credits"}
  ]'::jsonb
  where id = 'surfe';

update public.tools
  set pools = '[
    {"credit_type":"monthly","label":"Monthly Credits","unit":"credits"},
    {"credit_type":"topup","label":"Top-up Credits","unit":"credits"}
  ]'::jsonb
  where id = 'valueserp';

-- ---------------------------------------------------------------------------
-- Migration 009 parity (same migrations-run-before-seed problem): the three
-- original tools' top-up URLs, and the default low threshold rule 009
-- backfilled on the hosted DB. Later tools set default_low_threshold in their
-- own inserts, so the guarded update only touches the original wave.
-- ---------------------------------------------------------------------------
update public.tools set topup_url = 'https://app.neverbounce.com/account/billing' where id = 'neverbounce';
update public.tools set topup_url = 'https://app.millionverifier.com/' where id = 'millionverifier';
update public.tools set topup_url = 'https://openrouter.ai/credits' where id = 'openrouter';

update public.tools
  set default_low_threshold = default_alert_threshold * 3
  where default_alert_threshold is not null
    and default_low_threshold is null;
