// The directory's filter buckets: one per job a tool's credits are bought
// for, in chip order. Site-only on purpose: the catalog's `tools.category`
// column keeps its four values, and every id in src/data/tools.json must sit in
// exactly one bucket below (test/buckets.test.mjs fails otherwise).

/** @type {readonly { id: string, label: string, tools: readonly string[] }[]} */
export const BUCKETS = [
  {
    id: "email_finding",
    label: "Email finding",
    tools: [
      "anymailfinder", "apollo", "bettercontact", "contactout", "dropcontact", "enrichcrm",
      "enrow", "findymail", "fullenrich", "hunter", "leadmagic", "lusha", "oceanio", "oppora",
      "prospeo", "rocketreach", "sixtyfour", "skrapp", "snov", "surfe", "tomba", "wiza",
    ],
  },
  {
    id: "people_company_data",
    label: "People and company data",
    tools: [
      "aiark", "akta", "aviato", "blitzapi", "builtwith", "clay", "companyenrich", "crustdata",
      "datagma", "dropleads", "enrichlayer", "eodhd", "fetchin", "fiberai", "getleads", "icypeas",
      "influencersclub", "leadsforge", "mobiusengine-jobs", "moltsets", "openmart", "orthogonal",
      "peopledatalabs", "predictleads", "reechee", "sumble", "thecompaniesapi", "theirstack", "uplead",
    ],
  },
  {
    id: "verification",
    label: "Verification",
    tools: [
      "bounceban", "bouncer", "bouncify", "clearout", "debounce", "emailable", "emailhippo",
      "emaillistverify", "hlrlookup", "kickbox", "mailercheck", "millionverifier",
      "myemailverifier", "neverbounce", "reoon", "verifalia", "zerobounce",
    ],
  },
  {
    id: "scraping_proxies",
    label: "Scraping and proxies",
    tools: [
      "apify", "brightdata", "captaindata", "contextdev", "crawl4ai", "crawlbase", "decodo",
      "diffbot", "firecrawl", "hasdata", "ipinfo", "iproyal", "litescrape", "netnut", "olostep",
      "outscraper", "phantombuster", "scrapecreators", "scrapedo", "scrapegraphai", "scrapeops",
      "scraperapi", "scrapfly", "scrapingant", "scrapingbee", "scrapingdog", "shodan",
      "spidercloud", "tikhub", "tinyfish", "treg", "webshare",
    ],
  },
  {
    id: "search_seo",
    label: "Search and SEO",
    tools: [
      "ahrefs", "cloro", "dataforseo", "keywordseverywhere", "linkup", "majestic", "mangools",
      "moz", "orbisearch", "scaleserp", "search1api", "searchapi", "semrush", "seranking",
      "serpapi", "serper", "serpstat", "serpwow", "similarweb", "tavily", "valueserp", "valyu",
      "youcom", "zenserp",
    ],
  },
  {
    id: "sending_messaging",
    label: "Sending and messaging",
    tools: [
      "brevo", "hubspot", "instantly", "lemlist", "plivo", "sendgrid", "telnyx", "twilio",
      "vonage",
    ],
  },
  {
    id: "ai_media",
    label: "AI and media",
    tools: [
      "anyapi", "deepgram", "deepl", "deepseek", "elevenlabs", "fal", "fishaudio", "heygen",
      "hyperbolic", "meltly", "openrouter", "piapi", "reapi", "runway", "stability",
    ],
  },
]

/** @type {Readonly<Record<string, string>>} tool id -> bucket id */
export const TOOL_BUCKET = Object.fromEntries(
  BUCKETS.flatMap((bucket) => bucket.tools.map((id) => [id, bucket.id]))
)
