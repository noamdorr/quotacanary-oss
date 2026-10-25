// P-QUO-42 / QUO-325: HOME copy approved by Noam on 2026-10-23 or retained
// from prior QUO-191, QUO-212 and QUO-213 picks. MAC security copy is also
// approved; Privacy and Terms approved on 2026-10-24. Public-document review,
// publication and merge remain pending.
export const SITE_URL = "https://quotacanary.com"
export const GITHUB_URL = "https://github.com/noamdorr/quotacanary-oss"
export const SELF_HOST_URL = `${GITHUB_URL}/blob/master/docs/SELF_HOSTING.md`
export const UPDATE_DISCLOSURE = "If you opt in to update checks, the app sends its app version, macOS version and chip to the signed update feed."
export const TOOL_REQUEST_MAILTO = "mailto:hey@quotacanary.com?subject=Tool%20request"

export const TAGLINE = "the bird that sings before the credits die"

export const HOME = {
  // 6C
  pageTitle: "QuotaCanary - the bird that sings before the credits die",
  pageDescription:
    "A free, open-source Mac menu bar app that watches the credit balances of your API tools and warns you when credits are running low.",
  // Noam reconfirmed the existing hero on 2026-10-23. Privacy is supporting copy.
  oneLiner: "A menu bar app that warns you before your API credits run out.",
  // QUO-191 5A: no public build until QUO-140 and QUO-142 land. Never a link
  // without a real artifact URL.
  downloadButton: "Coming soon",
  // 2B. The Mac source is published with the first release (QUO-142).
  facts: ["Free and open source", "macOS 26+", "Apple silicon"],
  // 3B
  navCta: "Download",
  // Alert and key copy approved by Noam on 2026-10-23; alert limits stay in the FAQ.
  features: [
    {
      id: "warn",
      title: "Low-balance alerts",
      body: "Set a number you care about for each tool. Once the balance drops below it, the bird in your menu bar changes color and a notification shows up.",
      image: "/mac/alerts.webp",
      width: 380,
      height: 349,
      alt: "The QuotaCanary menu offering to turn on macOS notifications for low balances.",
    },
    {
      id: "eta",
      title: "Run-out estimates",
      body: "After a few readings it works out how fast each balance is going down and roughly when it hits zero: 2 days, 3 weeks. The one that runs out first is at the top of the list.",
      image: "/mac/window.webp",
      width: 1000,
      height: 592,
      alt: "The QuotaCanary window listing balances with their remaining credits and estimated time until empty.",
    },
    {
      id: "keys",
      title: "Local, always.",
      body: "No signup required. Your API keys stay in your Mac’s Keychain and only go to the tools they belong to.",
      image: "/mac/connect.webp",
      width: 380,
      height: 368,
      alt: "Connecting Hunter in QuotaCanary, with the note that the key is stored in the Mac's Keychain and sent only to Hunter.",
    },
  ],
  webHeading: "Not on a Mac?",
  webBody:
    "Run the web version yourself. You operate the server, database and polling schedule. Its API and MCP server read that instance, not the connections on your Mac.",
  webCta: "Read the self-host guide",
  videoCta: "See how it works (26s)",
  // Noam's 2026-10-23 pick: free and open source permanently, no feature list.
  pricingHeadline: "Free. Open source. Staying that way.",
  pricingCta: "Get the bird",
  pricingFootnote: "No signup. No credit card. No “talk to sales.” There is no sales.",
  closingHeading: "The bird that sings before the credits die.",
} as const

export const FOOTER_NOTE = "© 2026 QuotaCanary."

// Security page copy approved by Noam on 2026-10-23; disclosure remains mandatory.
export const MAC = {
  securityHeading: "The Mac app",
  securityParagraph: "Vendor keys live in your Mac’s login Keychain, with iCloud synchronization disabled, and never go to QuotaCanary servers. The app reads balances directly from vendors using their keys.",
} as const
