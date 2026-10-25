export const COPY = {
  tagline: "the bird that sings before the credits die",
  heroEyebrow: "Credit monitoring for your API stack",
  heroHeadline: { lead: "Your credits are ", em: "quietly", tail: " dying." },
  heroSub:
    "QuotaCanary watches the balances you connect and warns you before one runs dry.",
  ctaPrimary: "Connect your first tool",
  pricingHeadline: "Free, while we figure it out.",
  pricingCta: "Sign up for free",
  pricingFeatures: [
    "Every balance you connect, one dashboard",
    "Burn-rate forecasts that name the day you run dry",
    "Low-balance alerts to Slack or any webhook",
    "Per-balance thresholds you control",
    "Read your balances over a plain API",
    "An MCP server, so your agents can check too",
  ],
  pricingFootnote: 'No credit card. No "talk to sales." There is no sales.',
  footerNote: "© 2026 QuotaCanary.",
  // QUO-191: Mac section, /mac page and the connected-mode story. Round 2
  // picks (Noam, 2026-10-11): homepage 1A, /mac 2A, one-way story 3C,
  // security 4A; the two-way block is 5A by default. All variants live in
  // docs/copy/2026-10-11-quo-191-mac-section-variants.md.
  mac: {
    sectionEyebrow: "Mac app",
    sectionHeadline: "A menu bar app that watches your GTM credits.",
    sectionBody:
      "QuotaCanary for Mac reads the credit balances of your outreach and data tools and warns you before one runs out. Run it on its own, with keys in your login Keychain and nothing leaving the Mac, or sign in to a QuotaCanary account so the watching continues while the Mac sleeps.",
    sectionCta: "See the Mac app",
    pageTitle: "Mac app - QuotaCanary",
    pageDescription:
      "A menu bar app that watches the credit balances of your GTM tools and warns you before one runs out. Local with keys in your Keychain, or signed in so the hosted poller keeps watching while the Mac sleeps.",
    pageEyebrow: "QuotaCanary for Mac",
    pageHeadline: "Credit alerts for your GTM tools, in the menu bar.",
    pageWhat:
      "QuotaCanary watches the credit balances of the tools your outreach runs on (enrichment, verification, scraping, SERP data) and warns you before one runs out. The Mac app is the native way to run it: a bird in the menu bar, a macOS notification when a balance drops below the number you set, and a guess at how many days are left once it has a few readings.",
    twoWaysEyebrow: "Two ways to run it",
    twoWaysHeading: "Local, or signed in. Both are the full app.",
    localTitle: "Local",
    localBody:
      "No account. Each vendor key lives in your login Keychain and is sent only to its vendor. The app checks while the Mac is awake and notifies you on the Mac. Nothing leaves the machine.",
    accountTitle: "Signed in",
    accountBody:
      "Paste a token from your QuotaCanary account. Connections you move to the account are polled by the hosted service, so they stay watched while the Mac sleeps; alerts go to Slack, email or a webhook, and the web dashboard keeps the history.",
    storyHeading: "One place or the other",
    connectedStory: [
      "Think of the account as a second place a connection can live. Moving one there uploads its key, encrypted server-side like any web connection, and hands the checking to a poller that does not sleep when your laptop does. The move only goes one direction: coming back means removing it on the web and adding the key again in the app.",
      "Alert destinations and API tokens are web-side; the app links out instead of growing a second console.",
    ],
    requirementsHeading: "Requirements",
    requirements:
      "macOS 26 or newer on Apple silicon. An Intel build exists but has not been tested on Intel hardware yet, so it is not listed as supported.",
    leavesHeading: "What leaves the Mac",
    leaves:
      "For a local connection, balance requests go from your Mac straight to the vendor. The only thing that reaches us is the update check, if you turn it on, and it carries the app version, your macOS version and your chip. Never a key, never a balance. Sign in, and only the connections you move to the account are uploaded.",
    downloadHeading: "Download",
    // No href on purpose: there is no public build until QUO-140 and QUO-142
    // land. Never turn this into a link without a real artifact URL.
    downloadButton: "Coming soon",
    downloadNote:
      "A Developer ID signed, notarized build is on the way, and the app's source is published with that first release. Until then there is no download here, and we would rather say so than point you at an unsigned one.",
    securityHeading: "The Mac app",
    securityParagraph:
      "QuotaCanary for Mac runs two ways, and the key handling differs. A local connection keeps its key in your login Keychain, not synced to iCloud, and sends it only to the vendor; the app has no server of its own, and its one optional request to us is the update check (app version, macOS version, chip). A connection you move to your account is uploaded once and from then on handled exactly as described above: encrypted with AES-256-GCM, decrypted only at poll time, and subject to the same honest limit.",
  },
} as const
