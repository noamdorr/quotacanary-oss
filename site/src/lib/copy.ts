import macFeed from "../../public/mac/updates.json"
import macDmg from "../data/mac-dmg.json"

export const SITE_URL = "https://quotacanary.com"
export const GITHUB_URL = "https://github.com/noamdorr/quotacanary-oss"
export const SELF_HOST_URL = `${GITHUB_URL}/blob/main/docs/SELF_HOSTING.md`
export const UPDATE_DISCLOSURE = "If you opt in to update checks, the app sends its app version, macOS version and chip to the signed update feed."
export const TOOL_REQUEST_MAILTO = "mailto:hey@quotacanary.com?subject=Tool%20request"
// QUO-333: tool makers submit on the mirror's GitHub issue form.
export const TOOL_SUBMIT_URL = `${GITHUB_URL}/issues/new?template=tool-submission.yml`
// QUO-369: the site's /download/mac redirect (server.mjs) points at the newest
// signed DMG on the mirror's mac-v<version> release. Set to null to fall back
// to the disabled span, which fires no download event (QUO-55).
export const MAC_DOWNLOAD_URL: string | null = "/download/mac"
// QUO-402: the version the download serves. server.mjs names the DMG from this
// same feed file (latestMacVersion), so the page and the file cannot disagree;
// test/mac-version.test.mjs checks the built page against it.
export const MAC_VERSION: string = macFeed.version
export const MAC_RELEASE_URL = `${GITHUB_URL}/releases/tag/mac-v${MAC_VERSION}`
// QUO-429: the SHA-256 of the DMG /download/mac serves, committed beside the
// version and written by mac/scripts/release.sh. Never computed at build time
// (Railway builds site/ alone); test/mac-checksum.test.mjs pins it to the feed
// version and, on request, to GitHub's digest for the release asset.
export const MAC_DMG_SHA256: string = macDmg.sha256
export const MAC_TAG = `mac-v${MAC_VERSION}`
export const MAC_DMG_FILE = `QuotaCanary-${MAC_VERSION}.dmg`
// QUO-380: the Keychain store behind "Local, always." on the public mirror.
export const KEYCHAIN_CODE_URL = `${GITHUB_URL}/blob/main/mac/Sources/QuotaCanaryCore/CredentialStore.swift`
// QUO-417: the vendor transport and its redirect policy, proof that a key only goes to its own vendor.
export const TRANSPORT_CODE_URL = `${GITHUB_URL}/blob/main/mac/Sources/QuotaCanaryCore/Transport.swift`
// QUO-435: the same two files pinned to the shipped release tag, so a link on
// /security cannot drift from the build a visitor downloaded.
export const KEYCHAIN_CODE_URL_AT_TAG = `${GITHUB_URL}/blob/${MAC_TAG}/mac/Sources/QuotaCanaryCore/CredentialStore.swift`
export const TRANSPORT_CODE_URL_AT_TAG = `${GITHUB_URL}/blob/${MAC_TAG}/mac/Sources/QuotaCanaryCore/Transport.swift`
// PollScheduler.nominalInterval in the Mac app, in minutes; test/poll-interval.test.mjs
// fails when they drift apart.
export const MAC_POLL_MINUTES = 15

export const TAGLINE = "the bird that sings before the credits die"

export const HOME = {
  pageTitle: "QuotaCanary - the bird that sings before the credits die",
  pageDescription:
    "A free, open-source Mac menu bar app that watches the credit balances of your API tools and warns you when credits are running low.",
  // Privacy is supporting copy.
  oneLiner: "A menu bar app that warns you before your API credits run out.",
  // QUO-384: supporting line under the h1, privacy angle.
  heroSupport: "No account, no cloud. Your keys stay on your Mac.",
  // QUO-191: shown only while MAC_DOWNLOAD_URL is null. Never a link
  // without a real artifact URL.
  downloadButton: "Coming soon",
  // The first fact links to the public source (QUO-369).
  facts: ["Free and open source", "macOS 26+", "Apple silicon"],
  navCta: "Download",
  // QUO-374: shown under the Download button while MAC_DOWNLOAD_URL is set.
  notarized: "Signed and notarized by Apple.",
  // QUO-402: after the notarized line, "v0.1.1, early release." and a link to
  // the GitHub release.
  maturity: "early release.",
  releaseNotes: "Release notes",
  // QUO-236: under the notarized line.
  // The full name is deliberate: Homebrew's tap trust refuses the short one.
  homebrewPrompt: "Terminal person?",
  homebrewCommand: "brew install --cask noamdorr/tap/quotacanary",
  // QUO-406: phones only, beside the DMG button. The page link is shared or
  // copied, never the DMG.
  handoff: "Send it to your Mac",
  handoffCopied: "Link copied. Open it on your Mac.",
  // Alert limits stay in the FAQ.
  features: [
    {
      id: "eta",
      title: "Run-out estimates",
      // QUO-405: the last sentence bridges the estimate to the awake-Mac limit.
      body: "After two readings it works out how fast each balance is going down and roughly when it hits zero: 2 days, 3 weeks. The one that runs out first is at the top of the list. You see it coming days out, so a Mac asleep at 3am doesn’t cost you the campaign.",
      image: "/mac/window.webp",
      width: 1000,
      height: 592,
      // QUO-377: a phone export instead of a CSS crop of the desktop shot.
      phoneImage: "/mac/window-phone.webp",
      phoneWidth: 350,
      phoneHeight: 197,
      alt: "The QuotaCanary window listing balances with their remaining credits and estimated time until empty.",
      // QUO-405: the showcase stack's Apollo low alert, matching the window behind it,, as the app hands it to macOS
      // (Snapshot.swift "notification-site"). One 2x file; CSS sizes it.
      notification: {
        image: "/mac/notification.webp",
        width: 396,
        height: 100,
        alt: "A QuotaCanary notification. Apollo: Lead Credits low: 1,000 of 10,000 left.",
      },
      // QUO-418: the four notification triggers, from the FAQ answer.
      triggers: { lead: "Warns at", items: ["Low", "Critical", "Empty", "Can’t be checked"] },
    },
    {
      id: "keys",
      title: "Local, always.",
      body: "Keys live in your Mac’s login Keychain, never synced, and only ever travel to the tool they belong to.",
      image: "/mac/connect.webp",
      width: 380,
      height: 325,
      phoneImage: "/mac/connect-phone.webp",
      phoneWidth: 380,
      phoneHeight: 122,
      alt: "Connecting Hunter in QuotaCanary, with the note that the key is stored in the Mac's Keychain and sent only to Hunter.",
      // QUO-417: the transport link.
      links: [
        { label: "Read the Keychain code", href: KEYCHAIN_CODE_URL },
        { label: "Read the transport code", href: TRANSPORT_CODE_URL },
      ],
    },
  ],
  webHeading: "Not on a Mac?",
  webBody:
    "Run the web version yourself. You operate the server, database and polling schedule. Its API and MCP server read that instance, not the connections on your Mac.",
  webCta: "Read the self-host guide",
  videoCta: "See how it works (26s)",
  // Free and open source permanently, no feature list.
  pricingHeadline: "Free. Open source. Staying that way.",
  pricingFootnote: "No credit card. No “talk to sales.” There is no sales.",
  closingHeading: "The bird that sings before the credits die.",
} as const

export const DIRECTORY = {
  submitLead: "Run an API with a balance endpoint?",
  submitLink: "Send us the docs",
} as const

export const FOOTER_NOTE = "© 2026 QuotaCanary."

// Security page copy. The disclosure is mandatory.
export const MAC = {
  securityHeading: "The Mac app",
  securityParagraph: "Vendor keys live in your Mac’s login Keychain, with iCloud synchronization disabled, and never go to QuotaCanary servers. The app reads balances directly from vendors using their keys.",
} as const
