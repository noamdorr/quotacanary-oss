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
    'builtwith',
    'BuiltWith',
    '/logos/builtwith.png',
    'https://api.builtwith.com/agent-payment-api',
    'Go to BuiltWith Agent Payment API configuration, enable Agent API Billing, and copy the Agent API Key',
    'data',
    'api',
    250,
    true
  ),
  (
    'keywordseverywhere',
    'Keywords Everywhere',
    '/logos/keywordseverywhere.png',
    'https://api.keywordseverywhere.com/docs/#/miscellaneous/get_credits',
    'Go to Keywords Everywhere -> API key and copy your API key',
    'data',
    'api',
    1000,
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
    'scaleserp',
    'Scale SERP',
    '/logos/scaleserp.png',
    'https://docs.trajectdata.com/scaleserp/account-api',
    'Go to app.scaleserp.com -> Dashboard -> copy your API key',
    'data',
    'api',
    250,
    true
  ),
  (
    'crawlbase',
    'Crawlbase',
    '/logos/crawlbase.png',
    'https://crawlbase.com/docs/account-api',
    'For subscription products only. Go to Crawlbase -> Tokens, copy your token, and enter one product slug: crawling-api, crawler, smartproxy, scraper-api, leads-api, or screenshot-api. Allow five minutes between checks.',
    'data',
    'api',
    250,
    true
  ),
  (
    'bounceban',
    'BounceBan',
    '/logos/bounceban.png',
    'https://bounceban.com/public/doc/api.html',
    'Go to BounceBan -> API, copy your API key. Credits are account-wide and do not expire.',
    'email_verification',
    'api',
    250,
    true
  ),
  (
    'oceanio',
    'Ocean.io',
    '/logos/oceanio.png',
    'https://app.ocean.io/docs/getCreditBalance',
    'Go to app.ocean.io -> Settings -> API, copy your API token. One-time and recurring credits are reported separately.',
    'email_finding',
    'api',
    50,
    true
  ),
  (
    'sixtyfour',
    'Sixtyfour',
    '/logos/sixtyfour.png',
    'https://docs.sixtyfour.ai/api-reference/account/check-balance',
    'Go to app.sixtyfour.ai -> API keys, copy a key. The balance is the organization''s, shared by every key.',
    'email_finding',
    'api',
    5,
    true
  ),
  (
    'predictleads',
    'PredictLeads',
    '/logos/predictleads.png',
    'https://docs.predictleads.com/v3/api_endpoints/api_subscription/get_api_subscription_information',
    'Go to predictleads.com -> Your Subscription Plans, copy both the API key and the API token. The quota resets every month.',
    'data',
    'api',
    10,
    true
  ),
  (
    'scrapecreators',
    'Scrape Creators',
    '/logos/scrapecreators.png',
    'https://docs.scrapecreators.com/account/credit-balance',
    'Go to app.scrapecreators.com, copy your API key. Every endpoint draws from the same credit balance.',
    'data',
    'api',
    500,
    true
  ),
  (
    'crawl4ai',
    'Crawl4AI',
    '/logos/crawl4ai.png',
    'https://api.crawl4ai.com/docs',
    'Go to api.crawl4ai.com -> Dashboard, copy your API key (it is shown once). The balance trails live usage by about a minute.',
    'data',
    'api',
    100,
    true
  ),
  (
    'diffbot',
    'Diffbot',
    '/logos/diffbot.png',
    'https://www.diffbot.com/docs/account',
    'Go to app.diffbot.com, copy your API token. Remaining credits are this month''s plan allowance minus what the current billing cycle used.',
    'data',
    'api',
    500,
    true
  ),
  (
    'seranking',
    'SE Ranking',
    '/logos/seranking.png',
    'https://seranking.com/api/data/account-system/',
    'In SE Ranking, open the API dashboard and copy your Data API key. Checking the balance costs no units.',
    'data',
    'api',
    100000,
    true
  ),
  (
    'cloro',
    'cloro',
    '/logos/cloro.png',
    'https://cloro.dev/docs/api-reference/endpoint/get-credits',
    'Go to the cloro dashboard, copy your API key. The balance can trail live usage by up to a minute.',
    'data',
    'api',
    2500,
    true
  ),
  (
    'serpstat',
    'Serpstat',
    '/logos/serpstat.png',
    'https://api-docs.serpstat.com/docs/serpstat-public-api/p2grcut8yurv0-get-stats',
    'Go to serpstat.com/users/profile, copy your API token. Checking the balance costs no credits.',
    'data',
    'api',
    5000,
    true
  ),
  (
    'majestic',
    'Majestic',
    '/logos/majestic.png',
    'https://developer-support.majestic.com/api/commands/get-subscription-info.shtml',
    'In your Majestic account, open the API settings and copy your API key. Analysis, retrieval and index item info units show as separate balances.',
    'data',
    'api',
    10000,
    true
  ),
  (
    'clay',
    'Clay',
    '/logos/clay.png',
    'https://developers.clay.com/api-reference/credits/get-workspace-credit-balances',
    'In Clay, go to Settings, then Account, and create an API key. Data credits and actions show as separate balances, and checking them costs no credits.',
    'data',
    'api',
    500,
    true
  ),
  (
    'instantly',
    'Instantly',
    '/logos/instantly.png',
    'https://developer.instantly.ai/api-reference/workspacebilling/get-workspace-plan-details',
    'In Instantly, go to Settings, then Integrations, then API Keys, and create a key with the workspace_billing:read scope (all:read works too). Credits and leads show as separate balances.',
    'data',
    'api',
    200,
    true
  ),
  (
    'kickbox',
    'Kickbox',
    '/logos/kickbox.png',
    'https://docs.kickbox.com/docs/using-the-api',
    'In Kickbox, go to API, then Manage Keys, and copy a production key (it starts with live_).',
    'email_verification',
    'api',
    100,
    true
  ),
  (
    'sendgrid',
    'SendGrid',
    '/logos/sendgrid.png',
    'https://www.twilio.com/docs/sendgrid/api-reference/users-api/retrieve-your-credit-balance',
    'In SendGrid, go to Settings, then API Keys, and create a key that can read credits (user.credits.read). EU regional subusers are not supported yet.',
    'data',
    'api',
    20,
    true
  ),
  (
    'elevenlabs',
    'ElevenLabs',
    '/logos/elevenlabs.png',
    'https://elevenlabs.io/docs/api-reference/user/subscription/get',
    'In ElevenLabs, go to Developers, then API Keys, and create a key. If you restrict its permissions, keep User read access. Characters count down against your plan''s limit for the billing period.',
    'ai',
    'api',
    1000,
    true
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
    true
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
    true
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
    true
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
    true
  ),
  (
    'hubspot',
    'HubSpot',
    '/logos/hubspot.png',
    'https://developers.hubspot.com/docs/api-reference/latest/account/account-information/get-usage-details',
    'In HubSpot, go to Development, then Legacy apps, create a private legacy app and copy its access token from the Auth tab. This watches the daily API call limit your private apps share, not HubSpot credits, which have no API.',
    'data',
    'api',
    50000,
    true
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
    true
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
    true
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
    true
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
    true
  ),
  (
    'iproyal',
    'IPRoyal',
    '/logos/iproyal.png',
    'https://docs.iproyal.com/proxies/residential/api/user',
    'In the IPRoyal dashboard, open Settings and copy the token from the API section. Only residential traffic shows here; datacenter, ISP and mobile proxies are not supported yet.',
    'data',
    'api',
    1,
    true
  ),
  (
    'similarweb',
    'Similarweb',
    '/logos/similarweb.png',
    'https://developers.similarweb.com/docs/check-capabilities',
    'In Similarweb, open the API section of your account settings and copy your API key. The REST API is a paid add-on, so the key needs an API subscription.',
    'data',
    'api',
    5000,
    true
  ),
  (
    'ipinfo',
    'IPinfo',
    '/logos/ipinfo.png',
    'https://ipinfo.io/developers',
    'In the IPinfo dashboard, copy your access token. This watches the monthly request allowance on your plan.',
    'data',
    'api',
    2500,
    true
  ),
  (
    'mangools',
    'Mangools',
    '/logos/mangools.png',
    'https://mangools.com/api',
    'In your Mangools account, open the API page and copy your access token. Keyword lookups, SERP lookups and backlink rows show as separate balances.',
    'data',
    'api',
    25,
    true
  ),
  (
    'telnyx',
    'Telnyx',
    '/logos/telnyx.png',
    'https://developers.telnyx.com/api-reference/billing/get-user-balance-details',
    'In the Telnyx portal, open API Keys and copy a v2 API key (it starts with KEY). The balance shows in US dollars; accounts billed in another currency are not supported yet.',
    'data',
    'api',
    10,
    true
  ),
  (
    'scrapedo',
    'Scrape.do',
    '/logos/scrapedo.png',
    'https://scrape.do/documentation/api-response/usage-stats/',
    'In the Scrape.do dashboard, copy your API token. This watches the monthly request allowance on your plan; an inactive subscription reads as a rejected key.',
    'data',
    'api',
    10000,
    true
  ),
  (
    'hasdata',
    'HasData',
    '/logos/hasdata.png',
    'https://docs.hasdata.com/credits-and-concurrency',
    'In the HasData dashboard, copy your API key.',
    'data',
    'api',
    10000,
    true
  ),
  (
    'olostep',
    'Olostep',
    '/logos/olostep.png',
    'https://docs.olostep.com/api-reference/billing/credits-info',
    'In the Olostep dashboard, open API Keys and copy a key. The balance counts every credit you have left, top-ups included.',
    'data',
    'api',
    500,
    true
  ),
  (
    'lemlist',
    'lemlist',
    '/logos/lemlist.png',
    'https://developer.lemlist.com/api-reference/endpoints/team/get-team-credits',
    'In lemlist, click your profile picture, open Settings > Integrations and click Generate a new API key. lemlist shows the key only once. Credits are shared by the whole team.',
    'data',
    'api',
    100,
    true
  ),
  (
    'twilio',
    'Twilio',
    '/logos/twilio.png',
    'https://www.twilio.com/docs/iam/api/account',
    'In the Twilio Console home page, find Account Info and copy the Account SID and the Auth Token. Use the parent account: subaccounts have no balance of their own. The balance shows in US dollars; accounts billed in another currency are not supported yet.',
    'data',
    'api',
    5,
    true
  ),
  (
    'plivo',
    'Plivo',
    '/logos/plivo.png',
    'https://www.plivo.com/docs/account/api/account',
    'In the Plivo console, open the Overview page and copy the Auth ID and the Auth Token. The balance shows in US dollars.',
    'data',
    'api',
    5,
    true
  ),
  (
    'vonage',
    'Vonage',
    '/logos/vonage.png',
    'https://developer.vonage.com/en/api/account',
    'In the Vonage API Dashboard, copy the API key and the API secret from the home page (both also live under Settings). The balance shows in euros.',
    'data',
    'api',
    5,
    true
  ),
  (
    'peopledatalabs',
    'People Data Labs',
    '/logos/peopledatalabs.png',
    'https://docs.peopledatalabs.com/docs/usage-limits',
    'In the People Data Labs dashboard, click API Keys and copy the Active Key. The check reads the credit headers of a request with no parameters, so it never runs an enrichment.',
    'data',
    'api',
    25,
    true
  ),
  (
    'phantombuster',
    'PhantomBuster',
    '/logos/phantombuster.png',
    'https://hub.phantombuster.com/reference/get_orgs-fetch-resources',
    'In PhantomBuster, open Workspace settings from the navbar menu, scroll to Third party API keys and click Add third party API key. PhantomBuster shows the key only once.',
    'data',
    'api',
    60,
    true
  ),
  (
    'deepgram',
    'Deepgram',
    '/logos/deepgram.png',
    'https://developers.deepgram.com/reference/manage/billing/list',
    'In the Deepgram Console, pick the project, open Settings > API Keys and click Create a New API Key. Give it the Admin or Owner role: a Member key can list projects but cannot read billing. Deepgram shows the key only once.',
    'ai',
    'api',
    5,
    true
  ),
  (
    'webshare',
    'Webshare',
    '/logos/webshare.png',
    'https://apidocs.webshare.io/subscription',
    'In the Webshare dashboard, open API Keys (dashboard.webshare.io/userapi/keys), create a key and copy it.',
    'data',
    'api',
    1,
    true
  ),
  (
    'decodo',
    'Decodo',
    '/logos/decodo.png',
    'https://help.decodo.com/api-reference/subscriptions/get-subscriptions',
    'In the Decodo dashboard, click the Account and Settings icon at the top right, then Settings, and open the API Keys tab. Name the key, click Create and copy it: Decodo shows it only once.',
    'data',
    'api',
    1,
    true
  ),
  (
    'brevo',
    'Brevo',
    '/logos/brevo.png',
    'https://developers.brevo.com/reference/getaccount',
    'In Brevo, open SMTP & API (app.brevo.com/settings/keys/api), open the API keys tab and click Generate a new API key. Name it, click Generate and copy it: Brevo shows the key only once.',
    'data',
    'api',
    500,
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
    'apollo',
    'Apollo',
    '/logos/apollo.png',
    'https://docs.apollo.io/reference/view-credit-usage-stats',
    'Go to Apollo -> Settings -> Integrations -> API -> API keys -> Create new key, scope it to api/v1/usage_stats/credit_usage_stats only, and copy it',
    'email_finding',
    'api',
    500,
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
  -- Retired 2026-10-16 (072): the vendor shut down, Enrich Layer succeeds it.
  (
    'proxycurl',
    'Proxycurl',
    '/logos/proxycurl.png',
    'https://nubela.co/proxycurl/docs#view-credit-balance-endpoint',
    'Go to Proxycurl dashboard -> API and copy your API key',
    'data',
    'api',
    100,
    false
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
  ),
  (
    'aiark',
    'AI Ark',
    '/logos/aiark.png',
    'https://docs.ai-ark.com/reference/fetch-credit',
    'In the AI Ark developer portal, create an API key and copy it. Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true
  ),
  (
    'blitzapi',
    'BlitzAPI',
    '/logos/blitzapi.png',
    'https://docs.blitz-api.ai/api-reference/account/get-api-key-details',
    'In the BlitzAPI dashboard, copy your API key. Checking the balance costs no records.',
    'data',
    'api',
    100,
    true
  ),
  (
    'dropleads',
    'DropLeads',
    '/logos/dropleads.png',
    'https://dropleads.readme.io/reference/get_api-v2-prime-db-credits-balance',
    'In DropLeads, copy your Prime-DB API key. Keys for other DropLeads products do not work here.',
    'data',
    'api',
    250,
    true
  ),
  (
    'leadsforge',
    'Leadsforge',
    '/logos/leadsforge.png',
    'https://api.leadsforge.ai/public/swagger/index.html',
    'In Leadsforge, open your account settings and copy your API key. Credits reserved for running searches do not count toward the balance.',
    'data',
    'api',
    100,
    true
  ),
  (
    'serper',
    'Serper',
    '/logos/serper.png',
    'https://serper.dev',
    'In the Serper dashboard, open API Keys and copy your key. Checking the balance costs no credits.',
    'data',
    'api',
    250,
    true
  ),
  (
    'linkup',
    'Linkup',
    '/logos/linkup.png',
    'https://docs.linkup.so/api-reference/credits/creditsbalance',
    'In the Linkup dashboard, copy your API key. The balance shows in Linkup credits, which can be fractional.',
    'data',
    'api',
    1,
    true
  ),
  (
    'search1api',
    'Search1API',
    '/logos/search1api.png',
    'https://s1.dev/docs/essentials/credits-and-limits',
    'In the Search1API dashboard, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    500,
    true
  ),
  (
    'valyu',
    'Valyu',
    '/logos/valyu.png',
    'https://github.com/valyuAI/valyu-cli',
    'In the Valyu platform, create an API key with the billing:read scope and copy it. Data keys lack that scope by default and are rejected here.',
    'data',
    'api',
    5,
    true
  ),
  (
    'companyenrich',
    'CompanyEnrich',
    '/logos/companyenrich.png',
    'https://docs.companyenrich.com/reference/get_me',
    'In the CompanyEnrich dashboard, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true
  ),
  (
    'fetchin',
    'Fetchin',
    '/logos/fetchin.png',
    'https://docs.fetchin.io/api-reference/endpoint/get-subscription',
    'In the Fetchin dashboard, copy your API key. The balance counts pay-as-you-go credits on top of your plan, and checking it costs no credits.',
    'data',
    'api',
    100,
    true
  ),
  (
    'fiberai',
    'Fiber AI',
    '/logos/fiberai.png',
    'https://docs.fiber.ai/billing',
    'In the Fiber AI dashboard, copy your API key. Checking the balance costs no credits. With more than one subscription, the first one is watched.',
    'data',
    'api',
    100,
    true
  ),
  (
    'aviato',
    'Aviato',
    '/logos/aviato.png',
    'https://docs.data.aviato.co/api-reference/billing/get-balance',
    'In the Aviato dashboard, open your team, then API Keys, and create a key. The limit shown is the balance right after your last top-up.',
    'data',
    'api',
    100,
    true
  ),
  (
    'getleads',
    'GetLeads',
    '/logos/getleads.png',
    'https://www.getleads.io/docs/',
    'In the GetLeads app, create an API key under API keys (it starts with glb_live_). Checking the balance costs no credits. Unlimited plans have no credit balance to watch.',
    'data',
    'api',
    100,
    true
  ),
  (
    'moltsets',
    'MoltSets',
    '/logos/moltsets.png',
    'https://developer.moltsets.com/api-reference/account/get-account',
    'In the MoltSets dashboard, copy your API key. Checking the balance costs no credits. Unlimited plans have no token balance to watch.',
    'data',
    'api',
    100,
    true
  ),
  (
    'openmart',
    'Openmart',
    '/logos/openmart.png',
    'https://app.openmart.com/api-docs/get-credit-balance',
    'In the Openmart app, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    50,
    true
  ),
  (
    'moz',
    'Moz',
    '/logos/moz.png',
    'https://moz.com/api/docs/beta/quota-lookup',
    'In your Moz account, open API, then API Keys, and copy a v3 API token. Checking the quota costs no rows.',
    'data',
    'api',
    100,
    true
  ),
  (
    'contextdev',
    'Context.dev',
    '/logos/contextdev.png',
    'https://docs.context.dev/api-reference/usage/retrieve',
    'In the Context.dev dashboard, create an API key with the logs:read permission (the usage endpoint needs it). Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true
  ),
  (
    'akta',
    'Akta',
    '/logos/akta.png',
    'https://docs.akta.pro/docs/developer-tools/cli/commands',
    'In the akta.pro dashboard, copy your API key. Checking the balance costs no credits.',
    'data',
    'api',
    100,
    true
  ),
  (
    'litescrape',
    'Litescrape',
    '/logos/litescrape.png',
    'https://litescrape.com/docs/key-status',
    'In the Litescrape dashboard, copy your API key. Checking the balance costs no calls, even at zero.',
    'data',
    'api',
    100,
    true
  ),
  (
    'tinyfish',
    'TinyFish',
    '/logos/tinyfish.png',
    'https://docs.tinyfish.ai/api-reference/wallet/get-wallet',
    'In the TinyFish dashboard, open API Keys and copy a key. The balance check needs an account on wallet billing.',
    'data',
    'api',
    5,
    true
  ),
  (
    'tikhub',
    'TikHub',
    '/logos/tikhub.png',
    'https://docs.tikhub.io/186826050e0',
    'In the TikHub user center, open API Token and create a token with the /api/v1/tikhub/user/ scope. Checking the balance is free.',
    'data',
    'api',
    5,
    true
  ),
  (
    'hlrlookup',
    'HLR Lookup',
    '/logos/hlrlookup.png',
    'https://www.hlrlookup.com/knowledge',
    'In your HLR Lookup account, copy the API key and the API secret.',
    'data',
    'api',
    100,
    true
  ),
  (
    'icypeas',
    'Icypeas',
    '/logos/icypeas.png',
    'https://api-doc.icypeas.com/subscriptions/subscription-information/',
    'In Icypeas, open your profile and go to the API section to copy the API key. Also enter the email you sign in to Icypeas with: the balance check asks for it.',
    'data',
    'api',
    100,
    true
  ),
  (
    'thecompaniesapi',
    'The Companies API',
    '/logos/thecompaniesapi.png',
    'https://www.thecompaniesapi.com/api/fetch-team',
    'In The Companies API, open Settings and then API tokens to create a token. Copy your team ID from the dashboard as well: credits belong to the team.',
    'data',
    'api',
    100,
    true
  ),
  (
    'youcom',
    'You.com',
    '/logos/youcom.png',
    'https://you.com/docs/api-reference/billing/get-account-balance',
    'In the You.com platform, open API Keys and copy your key. On an organization key the balance is the shared org pool. Checking it is free.',
    'data',
    'api',
    5,
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
    topup_url = 'https://hunter.io/welcome/upgrade',
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

-- BuiltWith exposes one API credits pool through the Agent Payment API.
update public.tools
  set
    default_low_threshold = 750,
    topup_url = 'https://payments.builtwith.com/agent-payment-api-config',
    pools = '[
      {"credit_type":"credits","label":"API Credits","unit":"credits"}
    ]'::jsonb
  where id = 'builtwith';

-- Keywords Everywhere exposes one account credit balance pool.
update public.tools
  set
    default_low_threshold = 3000,
    topup_url = 'https://keywordseverywhere.com/pricing.html',
    pools = '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb
  where id = 'keywordseverywhere';

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

-- Apollo meters each action from its own credit pool. The catalog declares the
-- four a GTM stack actually watches; the adapter still reports any other pool
-- the account has, so nothing is lost by keeping this list short.
update public.tools
  set
    default_low_threshold = 1500,
    topup_url = 'https://app.apollo.io/#/settings/plans/upgrade',
    pools = '[
      {"credit_type":"lead_credit","label":"Lead Credits","unit":"credits"},
      {"credit_type":"export_credit","label":"Export Credits","unit":"credits"},
      {"credit_type":"direct_dial_credit","label":"Direct Dial Credits","unit":"credits"},
      {"credit_type":"ai_credit","label":"AI Credits","unit":"credits"}
    ]'::jsonb
  where id = 'apollo';

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
update public.tools set description = 'B2B contact database and sales engagement, metered from separate lead, export, dial, and AI credit pools.' where id = 'apollo';
update public.tools set description = 'Outbound sales automation with contact discovery and phone lookup, billed from data and phone credit pools.' where id = 'oppora';
update public.tools set description = 'Waterfall contact enrichment for email and phone, billed from account credits.' where id = 'bettercontact';
update public.tools set description = 'Search engine results as structured data, priced per search.' where id = 'serpapi';
update public.tools set description = 'Web scraping API with proxies and headless rendering, billed per credit.' where id = 'scrapingbee';
update public.tools set description = 'Web scraping with rotating proxies, priced per API credit.' where id = 'scraperapi';
update public.tools set description = 'Web and search scraping API, billed per request credit.' where id = 'scrapingdog';
update public.tools set description = 'Proxies and web data at scale, billed by usage balance.' where id = 'brightdata';
update public.tools set description = 'Website technology intelligence and lead data APIs, billed from API credits.' where id = 'builtwith';
update public.tools set description = 'SEO keyword, traffic, and backlink data APIs, billed from account credits.' where id = 'keywordseverywhere';
update public.tools set description = 'A platform of scrapers and automations, billed from a prepaid balance.' where id = 'apify';
update public.tools set description = 'Turn websites into clean, LLM-ready data, priced per credit.' where id = 'firecrawl';
update public.tools set description = 'Search, extraction, crawl, and research APIs for AI agents, billed from API credits.' where id = 'tavily';
update public.tools set description = 'SEO and SERP data APIs, billed from a prepaid balance.' where id = 'dataforseo';
update public.tools set description = 'SEO data and backlink intelligence APIs, billed from monthly API units.' where id = 'ahrefs';
update public.tools set description = 'SEO and competitive intelligence APIs, billed from API units.' where id = 'semrush';
update public.tools set description = 'Google search results as an API, priced per search credit.' where id = 'valueserp';
update public.tools set description = 'High-scale Google SERP data API, billed from monthly search credits.' where id = 'scaleserp';
update public.tools set description = 'Crawling and scraping APIs with remaining monthly credits for subscription products.' where id = 'crawlbase';
update public.tools set description = 'Email verification that handles catch-all domains, billed from prepaid credits.' where id = 'bounceban';
update public.tools set description = 'Lookalike company and contact data for B2B prospecting, billed from standard credits.' where id = 'oceanio';
update public.tools set description = 'AI research agents that enrich people and companies, billed from organization credits.' where id = 'sixtyfour';
update public.tools set description = 'Company intelligence signals such as job openings, news and technologies, billed from a monthly credit quota.' where id = 'predictleads';
update public.tools set description = 'Public social media data from TikTok, Instagram, YouTube and more as an API, billed per credit.' where id = 'scrapecreators';
update public.tools set description = 'Hosted crawling and page extraction for LLM pipelines, billed from prepaid credits.' where id = 'crawl4ai';
update public.tools set description = 'Knowledge Graph and AI extraction APIs for web data, billed from a monthly credit allowance.' where id = 'diffbot';
update public.tools set description = 'SEO data API for keywords, backlinks, domains and SERPs, billed from API units.' where id = 'seranking';
update public.tools set description = 'AI search answers from ChatGPT, Perplexity, Gemini and more as an API, billed from credits.' where id = 'cloro';
update public.tools set description = 'SEO platform API for keyword, domain, backlink and SERP data, billed per returned row.' where id = 'serpstat';
update public.tools set description = 'Backlink index API with Trust Flow and Citation Flow, billed from analysis, retrieval and index item info units.' where id = 'majestic';
update public.tools set description = 'GTM data enrichment workbench, billed from data credits and actions.' where id = 'clay';
update public.tools set description = 'Cold email outreach platform, billed from Instantly Credits and a plan lead limit.' where id = 'instantly';
update public.tools set description = 'Email verification API with a pay-as-you-go verification credit balance.' where id = 'kickbox';
update public.tools set description = 'Transactional and marketing email API from Twilio, with a monthly email credit allotment.' where id = 'sendgrid';
update public.tools set description = 'Text-to-speech and voice AI API, billed against a character quota per billing period.' where id = 'elevenlabs';
update public.tools set description = 'Generative media API for image, video and audio models, billed from a prepaid dollar balance.' where id = 'fal';
update public.tools set description = 'Stable Diffusion image generation API, billed from prepaid credits.' where id = 'stability';
update public.tools set description = 'Video and image generation API, billed from prepaid credits at one cent each.' where id = 'runway';
update public.tools set description = 'AI avatar video API, billed from a wallet, subscription credits or metered spend under a cap.' where id = 'heygen';
update public.tools set description = 'CRM platform. QuotaCanary watches the daily API call limit for private apps, since HubSpot credits have no balance API.' where id = 'hubspot';
update public.tools set description = 'Person and company enrichment API, the successor to Proxycurl, billed from prepaid credits.' where id = 'enrichlayer';
update public.tools set description = 'Machine translation API, billed per character against your plan or cost-control limit.' where id = 'deepl';
update public.tools set description = 'B2B contact and company data, billed from prepaid credits.' where id = 'uplead';
update public.tools set description = 'Company and people data API with live signals, billed from a shared credit balance.' where id = 'crustdata';
update public.tools set description = 'Residential proxy network, billed by the GB of traffic.' where id = 'iproyal';
update public.tools set description = 'Website and app traffic intelligence API, billed from data credits.' where id = 'similarweb';
update public.tools set description = 'IP geolocation and network data API, billed by monthly requests.' where id = 'ipinfo';
update public.tools set description = 'SEO suite (KWFinder, SERPChecker, LinkMiner) with an API, billed from daily lookups and monthly backlink rows.' where id = 'mangools';
update public.tools set description = 'Communications platform API for SMS, voice and phone numbers, billed from an account balance in dollars.' where id = 'telnyx';
update public.tools set description = 'Web scraping API with rotating proxies, billed by monthly successful requests.' where id = 'scrapedo';
update public.tools set description = 'Web scraping and SERP data API, billed from a credit balance.' where id = 'hasdata';
update public.tools set description = 'Web scraping and crawling API for AI agents, billed from credits.' where id = 'olostep';
update public.tools set description = 'Cold outreach sequencer for email and LinkedIn, with lead data enrichment billed from a team credit balance.' where id = 'lemlist';
update public.tools set description = 'Communications platform API for SMS, voice and WhatsApp, billed from a prepaid balance in dollars.' where id = 'twilio';
update public.tools set description = 'SMS and voice API for business messaging, billed from a cash credit balance in dollars.' where id = 'plivo';
update public.tools set description = 'Communications APIs for SMS, voice and verification, billed from an account balance in euros.' where id = 'vonage';
update public.tools set description = 'Person and company data API for enrichment and search, billed per matched record from a credit balance.' where id = 'peopledatalabs';
update public.tools set description = 'Cloud automations that scrape and act on LinkedIn and the web, metered in monthly execution time, AI credits and email credits.' where id = 'phantombuster';
update public.tools set description = 'Speech-to-text, text-to-speech and voice agent APIs, billed from a prepaid dollar balance on each project.' where id = 'deepgram';
update public.tools set description = 'Datacenter, static and rotating residential proxies, with plans capped by monthly bandwidth in GB.' where id = 'webshare';
update public.tools set description = 'Residential proxy network (formerly Smartproxy), billed by the GB of traffic.' where id = 'decodo';
update public.tools set description = 'Email, SMS and marketing automation platform (formerly Sendinblue), with sends paid from email and SMS credits.' where id = 'brevo';
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
update public.tools set description = 'B2B people and company search with contact enrichment, billed from prepaid credits.' where id = 'aiark';
update public.tools set description = 'Contact and company enrichment API, billed in records that reset every month.' where id = 'blitzapi';
update public.tools set description = 'B2B lead database with verified contacts, billed from prepaid credits.' where id = 'dropleads';
update public.tools set description = 'AI lead generation and contact enrichment, billed from prepaid credits.' where id = 'leadsforge';
update public.tools set description = 'Google search results (SERP) API, billed from prepaid credits.' where id = 'serper';
update public.tools set description = 'Web search API for AI agents, billed from prepaid credits.' where id = 'linkup';
update public.tools set description = 'Search, news and crawl API, billed from prepaid credits.' where id = 'search1api';
update public.tools set description = 'Search API over web and proprietary data for AI agents, billed from a prepaid USD balance.' where id = 'valyu';
update public.tools set description = 'Company and people data API for enrichment and search, billed from credits.' where id = 'companyenrich';
update public.tools set description = 'Real-time professional profile and company data API, billed from credits.' where id = 'fetchin';
update public.tools set description = 'Company and people data API for AI agents, billed from credits.' where id = 'fiberai';
update public.tools set description = 'People and company data API, billed from prepaid credits.' where id = 'aviato';
update public.tools set description = 'B2B contact search and enrichment API, billed from plan credits.' where id = 'getleads';
update public.tools set description = 'Identity resolution API for emails, phones and company data, billed from tokens.' where id = 'moltsets';
update public.tools set description = 'Local business data and decision-maker contacts API, billed from credits.' where id = 'openmart';
update public.tools set description = 'SEO metrics API for links, domain authority and keywords, billed in rows.' where id = 'moz';
update public.tools set description = 'Brand, scraping and company data API (formerly Brand.dev), billed from credits.' where id = 'contextdev';
update public.tools set description = 'Company data and news signals API, billed from credits.' where id = 'akta';
update public.tools set description = 'SERP and web scraping API for Google, Amazon, TikTok and more, billed per call.' where id = 'litescrape';
update public.tools set description = 'Browser agent API for web automation, fetch and search, billed from a USD wallet.' where id = 'tinyfish';
update public.tools set description = 'Social data API for TikTok, Douyin, Instagram and more, billed from a USD balance.' where id = 'tikhub';
update public.tools set description = 'Phone number validation API with live HLR and MNP lookups, billed from prepaid credits.' where id = 'hlrlookup';
update public.tools set description = 'Email finder and verifier API for B2B contacts, billed from credits.' where id = 'icypeas';
update public.tools set description = 'Company data API for enrichment, search and lookalikes, billed from team credits.' where id = 'thecompaniesapi';
update public.tools set description = 'Web search, contents and research APIs for AI agents, billed from a prepaid USD balance.' where id = 'youcom';

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
update public.tools set website_url = 'https://trajectdata.com/serp/scale-serp-api/' where id = 'scaleserp';
update public.tools set website_url = 'https://crawlbase.com' where id = 'crawlbase';
update public.tools set website_url = 'https://bounceban.com' where id = 'bounceban';
update public.tools set website_url = 'https://www.ocean.io' where id = 'oceanio';
update public.tools set website_url = 'https://sixtyfour.ai' where id = 'sixtyfour';
update public.tools set website_url = 'https://predictleads.com' where id = 'predictleads';
update public.tools set website_url = 'https://scrapecreators.com' where id = 'scrapecreators';
update public.tools set website_url = 'https://api.crawl4ai.com' where id = 'crawl4ai';
update public.tools set website_url = 'https://www.diffbot.com' where id = 'diffbot';
update public.tools set website_url = 'https://seranking.com' where id = 'seranking';
update public.tools set website_url = 'https://cloro.dev' where id = 'cloro';
update public.tools set website_url = 'https://serpstat.com' where id = 'serpstat';
update public.tools set website_url = 'https://majestic.com' where id = 'majestic';
update public.tools set website_url = 'https://www.clay.com' where id = 'clay';
update public.tools set website_url = 'https://instantly.ai' where id = 'instantly';
update public.tools set website_url = 'https://kickbox.com' where id = 'kickbox';
update public.tools set website_url = 'https://sendgrid.com' where id = 'sendgrid';
update public.tools set website_url = 'https://elevenlabs.io' where id = 'elevenlabs';
update public.tools set website_url = 'https://fal.ai' where id = 'fal';
update public.tools set website_url = 'https://stability.ai' where id = 'stability';
update public.tools set website_url = 'https://runwayml.com' where id = 'runway';
update public.tools set website_url = 'https://www.heygen.com' where id = 'heygen';
update public.tools set website_url = 'https://www.hubspot.com' where id = 'hubspot';
update public.tools set website_url = 'https://enrichlayer.com' where id = 'enrichlayer';
update public.tools set website_url = 'https://www.deepl.com' where id = 'deepl';
update public.tools set website_url = 'https://www.uplead.com' where id = 'uplead';
update public.tools set website_url = 'https://crustdata.com' where id = 'crustdata';
update public.tools set website_url = 'https://iproyal.com' where id = 'iproyal';
update public.tools set website_url = 'https://www.similarweb.com' where id = 'similarweb';
update public.tools set website_url = 'https://ipinfo.io' where id = 'ipinfo';
update public.tools set website_url = 'https://mangools.com' where id = 'mangools';
update public.tools set website_url = 'https://telnyx.com' where id = 'telnyx';
update public.tools set website_url = 'https://scrape.do' where id = 'scrapedo';
update public.tools set website_url = 'https://hasdata.com' where id = 'hasdata';
update public.tools set website_url = 'https://www.olostep.com' where id = 'olostep';
update public.tools set website_url = 'https://www.lemlist.com' where id = 'lemlist';
update public.tools set website_url = 'https://www.twilio.com' where id = 'twilio';
update public.tools set website_url = 'https://www.plivo.com' where id = 'plivo';
update public.tools set website_url = 'https://www.vonage.com' where id = 'vonage';
update public.tools set website_url = 'https://www.peopledatalabs.com' where id = 'peopledatalabs';
update public.tools set website_url = 'https://phantombuster.com' where id = 'phantombuster';
update public.tools set website_url = 'https://deepgram.com' where id = 'deepgram';
update public.tools set website_url = 'https://www.webshare.io' where id = 'webshare';
update public.tools set website_url = 'https://decodo.com' where id = 'decodo';
update public.tools set website_url = 'https://www.brevo.com' where id = 'brevo';
update public.tools set website_url = 'https://contactout.com' where id = 'contactout';
update public.tools set website_url = 'https://www.apollo.io' where id = 'apollo';
update public.tools set website_url = 'https://nubela.co/proxycurl' where id = 'proxycurl';
update public.tools set website_url = 'https://ahrefs.com' where id = 'ahrefs';
update public.tools set website_url = 'https://www.semrush.com' where id = 'semrush';
update public.tools set website_url = 'https://tavily.com' where id = 'tavily';
update public.tools set website_url = 'https://builtwith.com' where id = 'builtwith';
update public.tools set website_url = 'https://keywordseverywhere.com' where id = 'keywordseverywhere';
update public.tools set website_url = 'https://melt.ly' where id = 'meltly';
update public.tools set website_url = 'https://bettercontact.rocks' where id = 'bettercontact';
update public.tools set website_url = 'https://shodan.io' where id = 'shodan';
update public.tools set website_url = 'https://enrich-crm.com' where id = 'enrichcrm';
update public.tools set website_url = 'https://skrapp.io' where id = 'skrapp';
update public.tools set website_url = 'https://oppora.ai' where id = 'oppora';
update public.tools set website_url = 'https://ai-ark.com' where id = 'aiark';
update public.tools set website_url = 'https://www.blitz-api.ai' where id = 'blitzapi';
update public.tools set website_url = 'https://www.dropleads.io' where id = 'dropleads';
update public.tools set website_url = 'https://www.leadsforge.ai' where id = 'leadsforge';
update public.tools set website_url = 'https://serper.dev' where id = 'serper';
update public.tools set website_url = 'https://www.linkup.so' where id = 'linkup';
update public.tools set website_url = 'https://s1.dev' where id = 'search1api';
update public.tools set website_url = 'https://www.valyu.ai' where id = 'valyu';
update public.tools set website_url = 'https://companyenrich.com' where id = 'companyenrich';
update public.tools set website_url = 'https://fetchin.io' where id = 'fetchin';
update public.tools set website_url = 'https://www.fiber.ai' where id = 'fiberai';
update public.tools set website_url = 'https://www.aviato.co' where id = 'aviato';
update public.tools set website_url = 'https://www.getleads.io' where id = 'getleads';
update public.tools set website_url = 'https://moltsets.com' where id = 'moltsets';
update public.tools set website_url = 'https://www.openmart.com' where id = 'openmart';
update public.tools set website_url = 'https://moz.com' where id = 'moz';
update public.tools set website_url = 'https://www.context.dev' where id = 'contextdev';
update public.tools set website_url = 'https://akta.pro' where id = 'akta';
update public.tools set website_url = 'https://litescrape.com' where id = 'litescrape';
update public.tools set website_url = 'https://www.tinyfish.ai' where id = 'tinyfish';
update public.tools set website_url = 'https://tikhub.io' where id = 'tikhub';
update public.tools set website_url = 'https://www.hlrlookup.com' where id = 'hlrlookup';
update public.tools set website_url = 'https://www.icypeas.com' where id = 'icypeas';
update public.tools set website_url = 'https://www.thecompaniesapi.com' where id = 'thecompaniesapi';
update public.tools set website_url = 'https://you.com' where id = 'youcom';

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
update public.tools set topup_url = 'https://trajectdata.com/serp/scale-serp-api/pricing/' where id = 'scaleserp';
update public.tools set topup_url = 'https://crawlbase.com/pricing' where id = 'crawlbase';
update public.tools set topup_url = 'https://bounceban.com/pricing' where id = 'bounceban';
update public.tools set topup_url = 'https://www.ocean.io/pricing' where id = 'oceanio';
update public.tools set topup_url = 'https://sixtyfour.ai/pricing' where id = 'sixtyfour';
update public.tools set topup_url = 'https://predictleads.com/pricing' where id = 'predictleads';
update public.tools set topup_url = 'https://scrapecreators.com/pricing' where id = 'scrapecreators';
update public.tools set topup_url = 'https://api.crawl4ai.com/dashboard/' where id = 'crawl4ai';
update public.tools set topup_url = 'https://www.diffbot.com/pricing' where id = 'diffbot';
update public.tools set topup_url = 'https://seranking.com/api.html' where id = 'seranking';
update public.tools set topup_url = 'https://cloro.dev/pricing/' where id = 'cloro';
update public.tools set topup_url = 'https://serpstat.com/page/pricing-plans/' where id = 'serpstat';
update public.tools set topup_url = 'https://majestic.com/plans-pricing' where id = 'majestic';
update public.tools set topup_url = 'https://www.clay.com/pricing' where id = 'clay';
update public.tools set topup_url = 'https://instantly.ai/pricing' where id = 'instantly';
update public.tools set topup_url = 'https://kickbox.com/pricing' where id = 'kickbox';
update public.tools set topup_url = 'https://sendgrid.com/en-us/pricing' where id = 'sendgrid';
update public.tools set topup_url = 'https://elevenlabs.io/pricing' where id = 'elevenlabs';
update public.tools set topup_url = 'https://fal.ai/dashboard/billing' where id = 'fal';
update public.tools set topup_url = 'https://platform.stability.ai/account/credits' where id = 'stability';
update public.tools set topup_url = 'https://dev.runwayml.com' where id = 'runway';
update public.tools set topup_url = 'https://www.heygen.com/api-pricing' where id = 'heygen';
update public.tools set topup_url = 'https://www.hubspot.com/pricing' where id = 'hubspot';
update public.tools set topup_url = 'https://enrichlayer.com/pricing' where id = 'enrichlayer';
update public.tools set topup_url = 'https://www.deepl.com/pro-api' where id = 'deepl';
update public.tools set topup_url = 'https://www.uplead.com/pricing/' where id = 'uplead';
update public.tools set topup_url = 'https://crustdata.com/pricing' where id = 'crustdata';
update public.tools set topup_url = 'https://iproyal.com/residential-proxies/' where id = 'iproyal';
update public.tools set topup_url = 'https://www.similarweb.com/corp/pricing/' where id = 'similarweb';
update public.tools set topup_url = 'https://ipinfo.io/pricing' where id = 'ipinfo';
update public.tools set topup_url = 'https://mangools.com/plans-and-pricing' where id = 'mangools';
update public.tools set topup_url = 'https://portal.telnyx.com/' where id = 'telnyx';
update public.tools set topup_url = 'https://scrape.do/pricing/' where id = 'scrapedo';
update public.tools set topup_url = 'https://hasdata.com/prices' where id = 'hasdata';
update public.tools set topup_url = 'https://www.olostep.com/pricing' where id = 'olostep';
update public.tools set topup_url = 'https://www.lemlist.com/pricing' where id = 'lemlist';
update public.tools set topup_url = 'https://console.twilio.com/us1/billing/manage-billing/billing-overview' where id = 'twilio';
update public.tools set topup_url = 'https://console.plivo.com/billing/' where id = 'plivo';
update public.tools set topup_url = 'https://dashboard.nexmo.com/billing-and-payments' where id = 'vonage';
update public.tools set topup_url = 'https://www.peopledatalabs.com/pricing' where id = 'peopledatalabs';
update public.tools set topup_url = 'https://phantombuster.com/pricing' where id = 'phantombuster';
update public.tools set topup_url = 'https://deepgram.com/pricing' where id = 'deepgram';
update public.tools set topup_url = 'https://www.webshare.io/pricing' where id = 'webshare';
update public.tools set topup_url = 'https://decodo.com/proxies/residential-proxies/pricing' where id = 'decodo';
update public.tools set topup_url = 'https://www.brevo.com/pricing/' where id = 'brevo';
update public.tools set topup_url = 'https://zenserp.com/pricing-plans/' where id = 'zenserp';
update public.tools set topup_url = 'https://ai-ark.com/pricing' where id = 'aiark';
update public.tools set topup_url = 'https://www.blitz-api.ai/pricing' where id = 'blitzapi';
update public.tools set topup_url = 'https://www.dropleads.io/#pricing' where id = 'dropleads';
update public.tools set topup_url = 'https://www.leadsforge.ai/pricing' where id = 'leadsforge';
update public.tools set topup_url = 'https://serper.dev/billing' where id = 'serper';
update public.tools set topup_url = 'https://app.linkup.so/billing' where id = 'linkup';
update public.tools set topup_url = 'https://s1.dev/pricing' where id = 'search1api';
update public.tools set topup_url = 'https://www.valyu.ai/pricing' where id = 'valyu';
update public.tools set topup_url = 'https://companyenrich.com/pricing' where id = 'companyenrich';
update public.tools set topup_url = 'https://fetchin.io/pricing' where id = 'fetchin';
update public.tools set topup_url = 'https://www.fiber.ai/pricing' where id = 'fiberai';
update public.tools set topup_url = 'https://data.aviato.co' where id = 'aviato';
update public.tools set topup_url = 'https://www.getleads.io/pricing/' where id = 'getleads';
update public.tools set topup_url = 'https://moltsets.com/pricing' where id = 'moltsets';
update public.tools set topup_url = 'https://www.openmart.com/pricing' where id = 'openmart';
update public.tools set topup_url = 'https://moz.com/products/api/pricing' where id = 'moz';
update public.tools set topup_url = 'https://www.context.dev/pricing' where id = 'contextdev';
update public.tools set topup_url = 'https://docs.akta.pro/getting-started/pricing' where id = 'akta';
update public.tools set topup_url = 'https://litescrape.com/pricing' where id = 'litescrape';
update public.tools set topup_url = 'https://www.tinyfish.ai/pricing' where id = 'tinyfish';
update public.tools set topup_url = 'https://tikhub.io/pricing' where id = 'tikhub';
update public.tools set topup_url = 'https://www.hlrlookup.com/pricing' where id = 'hlrlookup';
update public.tools set topup_url = 'https://www.icypeas.com/pricing' where id = 'icypeas';
update public.tools set topup_url = 'https://www.thecompaniesapi.com/pricing' where id = 'thecompaniesapi';
update public.tools set topup_url = 'https://you.com/platform' where id = 'youcom';

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

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'scaleserp';

update public.tools
  set
    default_low_threshold = 750,
    pools = '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"token","label":"Token","type":"password"},
      {"name":"product","label":"Product slug","type":"text","placeholder":"crawling-api"}
    ]'::jsonb
  where id = 'crawlbase';

-- QUO-216: treg gap slice 1. Ocean.io reports one-time and recurring credits
-- separately; PredictLeads needs an API key plus an API token.
update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id in ('bounceban', 'sixtyfour');

update public.tools
  set pools = '[
    {"credit_type":"one_time","label":"One-time credits","unit":"credits"},
    {"credit_type":"recurrent","label":"Recurring credits","unit":"credits"}
  ]'::jsonb
  where id = 'oceanio';

update public.tools
  set
    pools = '[
      {"credit_type":"credits","label":"Monthly credits","unit":"credits"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"apiKey","label":"API key","type":"password"},
      {"name":"apiToken","label":"API token","type":"password"}
    ]'::jsonb
  where id = 'predictleads';

-- QUO-217: treg gap slice 2. Diffbot's one pool is the monthly allowance.
update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id in ('scrapecreators', 'crawl4ai');

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Monthly credits","unit":"credits"}
  ]'::jsonb
  where id = 'diffbot';

-- QUO-218: treg gap slice 3. Majestic reports three unit balances.
update public.tools
  set pools = '[
    {"credit_type":"units","label":"API units","unit":"credits"}
  ]'::jsonb
  where id = 'seranking';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'cloro';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"API credits","unit":"credits"}
  ]'::jsonb
  where id = 'serpstat';

update public.tools
  set pools = '[
    {"credit_type":"analysis_units","label":"Analysis units","unit":"credits"},
    {"credit_type":"retrieval_units","label":"Retrieval units","unit":"credits"},
    {"credit_type":"index_item_info_units","label":"Index item info units","unit":"credits"}
  ]'::jsonb
  where id = 'majestic';

-- QUO-221: sweep slice A1. Clay and Instantly report two pools each.
update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Data credits","unit":"credits"},
    {"credit_type":"actions","label":"Actions","unit":"credits"}
  ]'::jsonb
  where id = 'clay';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"},
    {"credit_type":"leads","label":"Leads","unit":"credits"}
  ]'::jsonb
  where id = 'instantly';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'kickbox';

update public.tools
  set pools = '[
    {"credit_type":"emails","label":"Emails","unit":"credits"}
  ]'::jsonb
  where id = 'sendgrid';

-- QUO-222: sweep slice A2. HeyGen reports one of three pools, by billing type.
update public.tools
  set pools = '[
    {"credit_type":"characters","label":"Characters","unit":"credits"}
  ]'::jsonb
  where id = 'elevenlabs';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"usd"}
  ]'::jsonb
  where id = 'fal';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'stability';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'runway';

update public.tools
  set pools = '[
    {"credit_type":"wallet","label":"Wallet","unit":"usd"},
    {"credit_type":"subscription","label":"Premium credits","unit":"credits"},
    {"credit_type":"usage_based","label":"Spending cap","unit":"usd"}
  ]'::jsonb
  where id = 'heygen';

-- QUO-223: sweep slice A3. HubSpot's pool is the daily private-app API call limit.
update public.tools
  set pools = '[
    {"credit_type":"api_calls","label":"Daily API calls","unit":"credits"}
  ]'::jsonb
  where id = 'hubspot';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'enrichlayer';

update public.tools
  set pools = '[
    {"credit_type":"characters","label":"Characters","unit":"credits"}
  ]'::jsonb
  where id = 'deepl';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'uplead';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'crustdata';

update public.tools
  set pools = '[
    {"credit_type":"traffic","label":"Residential traffic","unit":"gb"}
  ]'::jsonb
  where id = 'iproyal';

update public.tools
  set pools = '[
    {"credit_type":"data_credits","label":"Data credits","unit":"credits"}
  ]'::jsonb
  where id = 'similarweb';

update public.tools
  set pools = '[
    {"credit_type":"requests","label":"Requests","unit":"credits"}
  ]'::jsonb
  where id = 'ipinfo';

update public.tools
  set pools = '[
    {"credit_type":"keyword_lookups","label":"Keyword lookups","unit":"credits"},
    {"credit_type":"serp_lookups","label":"SERP lookups","unit":"credits"},
    {"credit_type":"backlink_rows","label":"Backlink rows","unit":"credits"}
  ]'::jsonb
  where id = 'mangools';

update public.tools
  set pools = '[
    {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
  ]'::jsonb
  where id = 'telnyx';

update public.tools
  set pools = '[
    {"credit_type":"requests","label":"Requests","unit":"credits"}
  ]'::jsonb
  where id = 'scrapedo';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'hasdata';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'olostep';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'lemlist';

-- QUO-227: CPaaS balances. HTTP Basic over two values, so each sets
-- credential_fields; Critical 5 / Low 15 in the account currency.
update public.tools
  set
    default_low_threshold = 15,
    pools = '[
      {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"account_sid","label":"Account SID","type":"text"},
      {"name":"auth_token","label":"Auth token","type":"password"}
    ]'::jsonb
  where id = 'twilio';

update public.tools
  set
    default_low_threshold = 15,
    pools = '[
      {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"auth_id","label":"Auth ID","type":"text"},
      {"name":"auth_token","label":"Auth token","type":"password"}
    ]'::jsonb
  where id = 'plivo';

update public.tools
  set
    default_low_threshold = 15,
    pools = '[
      {"credit_type":"balance","label":"Balance (EUR)","unit":"eur"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"api_key","label":"API key","type":"text"},
      {"name":"api_secret","label":"API secret","type":"password"}
    ]'::jsonb
  where id = 'vonage';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'peopledatalabs';

update public.tools
  set pools = '[
    {"credit_type":"execution_time","label":"Execution time","unit":"minutes"},
    {"credit_type":"ai_credits","label":"AI credits","unit":"credits"},
    {"credit_type":"emails","label":"Emails","unit":"credits"}
  ]'::jsonb
  where id = 'phantombuster';

update public.tools
  set pools = '[
    {"credit_type":"traffic","label":"Traffic","unit":"gb"},
    {"credit_type":"free_credits","label":"Free credits","unit":"usd"}
  ]'::jsonb
  where id = 'webshare';

update public.tools
  set pools = '[
    {"credit_type":"traffic","label":"Residential traffic","unit":"gb"}
  ]'::jsonb
  where id = 'decodo';

update public.tools
  set pools = '[
    {"credit_type":"emails","label":"Email credits","unit":"credits"},
    {"credit_type":"sms","label":"SMS credits","unit":"credits"},
    {"credit_type":"free_emails","label":"Free daily emails","unit":"credits"}
  ]'::jsonb
  where id = 'brevo';

-- QUO-242: treg Bucket B slice B1 (contact enrichment).
update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'aiark';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Records","unit":"credits"}
  ]'::jsonb
  where id = 'blitzapi';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'dropleads';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'leadsforge';

-- QUO-243: treg Bucket B slice B4 (search APIs).
update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'serper';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'linkup';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'search1api';

update public.tools
  set pools = '[
    {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
  ]'::jsonb
  where id = 'valyu';

-- QUO-244: treg Bucket B slice B2 (company data).
update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'companyenrich';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'fetchin';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'fiberai';

-- QUO-245: treg Bucket B slice B3 (agent-first B2B data).
update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'aviato';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'getleads';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'moltsets';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'openmart';

-- QUO-246: treg Bucket B slice B6 (SEO, brand and signals).
update public.tools
  set pools = '[
    {"credit_type":"rows","label":"Rows","unit":"credits"}
  ]'::jsonb
  where id = 'moz';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'contextdev';

update public.tools
  set pools = '[
    {"credit_type":"credits","label":"Credits","unit":"credits"}
  ]'::jsonb
  where id = 'akta';

-- QUO-247: treg Bucket B slice B5 (scraping and social).
update public.tools
  set pools = '[
    {"credit_type":"calls","label":"Calls","unit":"credits"}
  ]'::jsonb
  where id = 'litescrape';

update public.tools
  set pools = '[
    {"credit_type":"wallet","label":"Wallet","unit":"usd"}
  ]'::jsonb
  where id = 'tinyfish';

update public.tools
  set pools = '[
    {"credit_type":"balance","label":"Balance (USD)","unit":"usd"}
  ]'::jsonb
  where id = 'tikhub';

-- QUO-248: treg Bucket B slice H1 (a second credential value beside the key).
update public.tools
  set
    pools = '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"api_key","label":"API key","type":"text"},
      {"name":"api_secret","label":"API secret","type":"password"}
    ]'::jsonb
  where id = 'hlrlookup';

update public.tools
  set
    pools = '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"api_key","label":"API key","type":"password"},
      {"name":"email","label":"Account email","type":"text"}
    ]'::jsonb
  where id = 'icypeas';

update public.tools
  set
    pools = '[
      {"credit_type":"credits","label":"Credits","unit":"credits"}
    ]'::jsonb,
    credential_fields = '[
      {"name":"api_token","label":"API token","type":"password"},
      {"name":"team_id","label":"Team ID","type":"text"}
    ]'::jsonb
  where id = 'thecompaniesapi';

-- QUO-249: treg Bucket B slice H2 (a balance in USD cents).
update public.tools
  set pools = '[
    {"credit_type":"balance","label":"Balance","unit":"usd"}
  ]'::jsonb
  where id = 'youcom';

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
