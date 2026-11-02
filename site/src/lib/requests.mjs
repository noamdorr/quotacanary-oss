// QUO-417: what the Mac app sends to read each tool's balance, shown on its
// directory page: method and URL per request, and where the key goes.
//
// Declarative tools come from a committed snapshot of the Mac catalog
// (request.method, request.url, auth.in and auth.name): the Railway service
// builds from site/ alone, so the build cannot read ../mac. Hand-written Swift
// adapters are listed below. test/requests.test.mjs fails when the snapshot
// drifts from the catalog, when a Mac tool has no entry, or when a listed URL's
// host is missing from its Swift adapter.
import DECLARATIVE from "../data/requests.json" with { type: "json" }

export { DECLARATIVE }

// Placeholders in braces stand for your own values; `where` finishes the
// sentence "Your key goes in ...".
export const HAND_WRITTEN = {
  ahrefs: { requests: [["GET", "https://api.ahrefs.com/v3/subscription-info/limits-and-usage"]], where: "the Authorization header" },
  apify: {
    requests: [
      ["GET", "https://api.apify.com/v2/users/me"],
      ["GET", "https://api.apify.com/v2/users/me/limits"],
    ],
    where: "the Authorization header",
  },
  apollo: { requests: [["POST", "https://api.apollo.io/api/v1/usage_stats/credit_usage_stats"]], where: "the x-api-key header" },
  brevo: { requests: [["GET", "https://api.brevo.com/v3/account"]], where: "the api-key header" },
  contactout: { requests: [["GET", "https://api.contactout.com/v1/stats"]], where: "the token header" },
  crawlbase: { requests: [["GET", "https://api.crawlbase.com/account?token={key}&product={product}"]], where: "the URL, as token=" },
  dataforseo: { requests: [["GET", "https://api.dataforseo.com/v3/appendix/user_data"]], where: "the Authorization header, with your login" },
  decodo: {
    requests: [
      ["GET", "https://api.decodo.com/v2/subscriptions"],
      ["GET", "https://api.decodo.com/v2/sub-users?service_type=residential_proxies"],
    ],
    where: "the Authorization header",
  },
  deepgram: {
    requests: [
      ["GET", "https://api.deepgram.com/v1/projects"],
      ["GET", "https://api.deepgram.com/v1/projects/{project id}/balances"],
    ],
    where: "the Authorization header",
  },
  deepseek: { requests: [["GET", "https://api.deepseek.com/user/balance"]], where: "the Authorization header" },
  diffbot: { requests: [["GET", "https://api.diffbot.com/v4/account?token={key}&days=31"]], where: "the URL, as token=" },
  enrichcrm: { requests: [["GET", "https://gateway.enrich-crm.com/api/credit_crm/v1/mine?apiId={key}"]], where: "the URL, as apiId=" },
  firecrawl: { requests: [["GET", "https://api.firecrawl.dev/v2/team/credit-usage"]], where: "the Authorization header" },
  hlrlookup: { requests: [["POST", "https://api.hlrlookup.com/apiv2/balance"]], where: "the request body, with your secret" },
  hyperbolic: { requests: [["GET", "https://api.hyperbolic.xyz/billing/get_current_balance"]], where: "the Authorization header" },
  icypeas: { requests: [["POST", "https://app.icypeas.com/api/a/actions/subscription-information"]], where: "the Authorization header" },
  lemlist: { requests: [["GET", "https://api.lemlist.com/api/team/credits"]], where: "the Authorization header" },
  majestic: { requests: [["POST", "https://api.majestic.com/api/json"]], where: "the request body" },
  mangools: {
    requests: [
      ["GET", "https://api.mangools.com/v3/kwfinder/requests"],
      ["GET", "https://api.mangools.com/v3/kwfinder/limits"],
    ],
    where: "the X-Access-Token header",
  },
  meltly: { requests: [["GET", "https://melt.ly/api/user/credits"]], where: "the x-api-key header" },
  netnut: { requests: [["POST", "https://customers-api.netnut.io/v1/customer/usage/myusage"]], where: "the Authorization header" },
  openrouter: { requests: [["GET", "https://openrouter.ai/api/v1/credits"]], where: "the Authorization header" },
  orthogonal: { requests: [["GET", "https://api.orthogonal.com/v1/credits/balance"]], where: "the Authorization header" },
  peopledatalabs: { requests: [["HEAD", "https://api.peopledatalabs.com/v5/person/enrich"]], where: "the X-Api-Key header" },
  phantombuster: { requests: [["GET", "https://api.phantombuster.com/api/v2/orgs/fetch-resources"]], where: "the X-Phantombuster-Key header" },
  plivo: { requests: [["GET", "https://api.plivo.com/v1/Account/{auth id}/"]], where: "the Authorization header, with your Auth ID" },
  predictleads: { requests: [["GET", "https://predictleads.com/api/v3/api_subscription"]], where: "the X-Api-Key and X-Api-Token headers" },
  rocketreach: { requests: [["GET", "https://api.rocketreach.co/api/v2/account/"]], where: "the Api-Key header" },
  semrush: { requests: [["GET", "https://www.semrush.com/users/countapiunits.html?key={key}"]], where: "the URL, as key=" },
  snov: {
    requests: [
      ["POST", "https://api.snov.io/v1/oauth/access_token"],
      ["GET", "https://api.snov.io/v1/get-balance"],
    ],
    where: "the first request's body, swapped for a short-lived token",
  },
  tavily: { requests: [["GET", "https://api.tavily.com/usage"]], where: "the Authorization header" },
  thecompaniesapi: { requests: [["GET", "https://api.thecompaniesapi.com/v2/teams/{team id}"]], where: "the Authorization header" },
  tomba: { requests: [["GET", "https://api.tomba.io/v1/me"]], where: "the X-Tomba-Key and X-Tomba-Secret headers" },
  treg: { requests: [["GET", "https://treg.to/orgs/{org id}/balance"]], where: "the X-Treg-Token header" },
  twilio: {
    requests: [["GET", "https://api.twilio.com/2010-04-01/Accounts/{account sid}/Balance.json"]],
    where: "the Authorization header, with your Account SID",
  },
  verifalia: { requests: [["GET", "https://api.verifalia.com/v2.7/credits/balance"]], where: "the Authorization header, with your username" },
  vonage: { requests: [["GET", "https://rest.nexmo.com/account/get-balance"]], where: "the Authorization header, with your secret" },
  webshare: {
    requests: [
      ["GET", "https://proxy.webshare.io/api/v2/subscription/"],
      ["GET", "https://proxy.webshare.io/api/v2/subscription/plan/{plan id}/"],
      ["GET", "https://proxy.webshare.io/api/v2/stats/aggregate/?timestamp__gte={from}&timestamp__lte={now}"],
    ],
    where: "the Authorization header",
  },
  youcom: { requests: [["GET", "https://api.you.com/v1/billing/account_balance"]], where: "the X-API-Key header" },
  zerobounce: { requests: [["GET", "https://api.zerobounce.net/v2/getcredits?api_key={key}"]], where: "the URL, as api_key=" },
}

function fromCatalog(entry) {
  if (entry.in === "query") {
    const joiner = entry.url.includes("?") ? "&" : "?"
    return { requests: [[entry.method, `${entry.url}${joiner}${entry.name}={key}`]], where: `the URL, as ${entry.name}=` }
  }
  if (entry.in === "path") return { requests: [[entry.method, entry.url]], where: "the URL path" }
  return { requests: [[entry.method, entry.url]], where: `the ${entry.name} header` }
}

/**
 * The requests and key placement for a tool id, or null.
 * @param {string} id
 * @returns {{ requests: string[][], where: string } | null}
 */
export function requestsFor(id) {
  if (HAND_WRITTEN[id]) return HAND_WRITTEN[id]
  return DECLARATIVE[id] ? fromCatalog(DECLARATIVE[id]) : null
}
