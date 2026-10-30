// P-QUO-42 / QUO-325: HOME copy approved by Noam on 2026-10-23 or retained
// from prior QUO-191, QUO-212 and QUO-213 picks. MAC security copy is also
// approved; Privacy and Terms approved on 2026-10-24. Public-document review,
// publication and merge remain pending.
export const SITE_URL = "https://quotacanary.com"
export const GITHUB_URL = "https://github.com/noamdorr/quotacanary-oss"
export const SELF_HOST_URL = `${GITHUB_URL}/blob/main/docs/SELF_HOSTING.md`
export const UPDATE_DISCLOSURE = "If you opt in to update checks, the app sends its app version, macOS version and chip to the signed update feed."
export const TOOL_REQUEST_MAILTO = "mailto:hey@quotacanary.com?subject=Tool%20request"
// QUO-333: tool makers submit on the mirror's GitHub issue form. The template is
// staged in scripts/public-issue-templates/ and hand-copied into the mirror.
export const TOOL_SUBMIT_URL = `${GITHUB_URL}/issues/new?template=tool-submission.yml`
// QUO-369: the site's /download/mac redirect (server.mjs) points at the newest
// signed DMG on the mirror's mac-v<version> release. Set to null to fall back
// to the disabled span, which fires no download event (QUO-55).
export const MAC_DOWNLOAD_URL: string | null = "/download/mac"
// QUO-380: the Keychain store behind "Local, always." on the public mirror.
export const KEYCHAIN_CODE_URL = `${GITHUB_URL}/blob/main/mac/Sources/QuotaCanaryCore/CredentialStore.swift`
// PollScheduler.nominalInterval in the Mac app, in minutes; test/poll-interval.test.mjs
// fails when they drift apart.
export const MAC_POLL_MINUTES = 15

export const TAGLINE = "the bird that sings before the credits die"

export const HOME = {
  // 6C
  pageTitle: "QuotaCanary - the bird that sings before the credits die",
  pageDescription:
    "A free, open-source Mac menu bar app that watches the credit balances of your API tools and warns you when credits are running low.",
  // Noam reconfirmed the existing hero on 2026-10-23. Privacy is supporting copy.
  oneLiner: "A menu bar app that warns you before your API credits run out.",
  // QUO-384: supporting line under the h1, privacy angle. Option C, picked by
  // Noam on 2026-10-30.
  heroSupport: "No account, no cloud. Your keys stay on your Mac.",
  // QUO-191 5A: shown only while MAC_DOWNLOAD_URL is null. Never a link
  // without a real artifact URL.
  downloadButton: "Coming soon",
  // 2B. The first fact links to the public source (QUO-369).
  facts: ["Free and open source", "macOS 26+", "Apple silicon"],
  // 3B
  navCta: "Download",
  // Alert and key copy approved by Noam on 2026-10-23; alert limits stay in the FAQ.
  features: [
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
      body: "Keys live in your Mac’s login Keychain, never synced, and only ever travel to the tool they belong to.",
      image: "/mac/connect.webp",
      width: 380,
      height: 368,
      alt: "Connecting Hunter in QuotaCanary, with the note that the key is stored in the Mac's Keychain and sent only to Hunter.",
      // QUO-380: label option A, approved by Noam on 2026-10-30.
      link: { label: "Read the Keychain code", href: KEYCHAIN_CODE_URL },
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
  pricingFootnote: "No credit card. No “talk to sales.” There is no sales.",
  closingHeading: "The bird that sings before the credits die.",
} as const

// QUO-333: Noam picked variant B on 2026-10-29 (form intro kept as drafted).
export const DIRECTORY = {
  submitLead: "Run an API with a balance endpoint?",
  submitLink: "Send us the docs",
} as const

export const FOOTER_NOTE = "© 2026 QuotaCanary."

// Security page copy approved by Noam on 2026-10-23; disclosure remains mandatory.
export const MAC = {
  securityHeading: "The Mac app",
  securityParagraph: "Vendor keys live in your Mac’s login Keychain, with iCloud synchronization disabled, and never go to QuotaCanary servers. The app reads balances directly from vendors using their keys.",
} as const
