// What a key must be or allow before the balance check can work (QUO-278).
// The `tools.key_instructions` column also said where to find the key; those
// paths went stale (ZeroBounce's was wrong), so they are no longer shown and
// only these requirements survive. The Mac app carries the same list in
// mac/Sources/QuotaCanaryCore/Copy.swift (`keyRequirements`).
const KEY_REQUIREMENTS: Record<string, string> = {
  apollo:
    "Create the key with only the api/v1/usage_stats/credit_usage_stats endpoint enabled. No master key needed: it only reads credit usage.",
  builtwith: "Enable Agent API Billing first, then use the Agent API Key.",
  crawlbase:
    "For subscription products only. Enter one product slug: crawling-api, crawler, smartproxy, scraper-api, leads-api, or screenshot-api. Allow five minutes between checks.",
  deepgram:
    "Give the key the Admin or Owner role: a Member key can list projects but cannot read billing.",
  deepl:
    "Only DeepL API Pro keys work here. Free keys (ending in :fx) are not supported yet.",
  dropleads:
    "Use your Prime-DB API key. Keys for other DropLeads products do not work here.",
  enrichlayer:
    "Former Proxycurl keys do not work here, since Enrich Layer issues new keys.",
  fal: "Use the Read Only, Billing or Full preset: the balance needs billing:usage:read.",
  heygen: "Enterprise wallets billed in credits are not supported yet.",
  hubspot:
    "Use a private legacy app's access token. This watches the daily API call limit your private apps share, not HubSpot credits.",
  instantly:
    "Create the key with the workspace_billing:read scope (all:read works too).",
  iproyal:
    "Only residential traffic shows here. Datacenter, ISP and mobile proxies are not supported yet.",
  kickbox: "Use a production key (it starts with live_).",
  scrapedo: "An inactive subscription reads as a rejected key.",
  sendgrid:
    "The key needs the user.credits.read permission. EU regional subusers are not supported yet.",
  similarweb:
    "The REST API is a paid add-on, so the key needs an API subscription.",
  telnyx:
    "Use a v2 API key. Accounts billed in a currency other than US dollars are not supported yet.",
  twilio:
    "Use the parent account: subaccounts have no balance of their own. Accounts billed in a currency other than US dollars are not supported yet.",
  valyu:
    "Create the key with the billing:read scope. Data keys lack it by default and are rejected here.",
}

export function keyRequirement(toolId: string): string | null {
  return KEY_REQUIREMENTS[toolId] ?? null
}
