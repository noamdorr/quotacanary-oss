export type RotatingToolLogo = {
  name: string
  logo: string
}

export const ROTATING_TOOL_SLOT_COUNT = 4

export const ROTATING_TOOL_LOGOS: readonly RotatingToolLogo[] = [
  { name: "NeverBounce", logo: "/logos/rotating/neverbounce.webp" },
  { name: "MillionVerifier", logo: "/logos/rotating/millionverifier.webp" },
  { name: "OpenRouter", logo: "/logos/rotating/openrouter.webp" },
  { name: "ZeroBounce", logo: "/logos/rotating/zerobounce.webp" },
  { name: "Bouncer", logo: "/logos/rotating/bouncer.webp" },
  { name: "Emailable", logo: "/logos/rotating/emailable.webp" },
  { name: "MailerCheck", logo: "/logos/rotating/mailercheck.webp" },
  { name: "Email Hippo", logo: "/logos/rotating/emailhippo.webp" },
  { name: "SerpApi", logo: "/logos/rotating/serpapi.webp" },
  { name: "Hunter", logo: "/logos/rotating/hunter.webp" },
  { name: "LeadMagic", logo: "/logos/rotating/leadmagic.webp" },
  { name: "Prospeo", logo: "/logos/rotating/prospeo.webp" },
  { name: "Findymail", logo: "/logos/rotating/findymail.webp" },
  { name: "FullEnrich", logo: "/logos/rotating/fullenrich.webp" },
  { name: "Enrich CRM", logo: "/logos/rotating/enrichcrm.webp" },
  { name: "Skrapp", logo: "/logos/rotating/skrapp.webp" },
  { name: "DeepSeek", logo: "/logos/rotating/deepseek.webp" },
  { name: "Hyperbolic", logo: "/logos/rotating/hyperbolic.webp" },
  { name: "Melt.ly", logo: "/logos/rotating/meltly.webp" },
  { name: "ScrapingBee", logo: "/logos/rotating/scrapingbee.webp" },
  { name: "ScraperAPI", logo: "/logos/rotating/scraperapi.webp" },
  { name: "Scrapingdog", logo: "/logos/rotating/scrapingdog.webp" },
  { name: "Bright Data", logo: "/logos/rotating/brightdata.webp" },
  { name: "Apify", logo: "/logos/rotating/apify.webp" },
  { name: "Firecrawl", logo: "/logos/rotating/firecrawl.webp" },
  { name: "Tavily", logo: "/logos/rotating/tavily.webp" },
  { name: "ScrapeGraphAI", logo: "/logos/rotating/scrapegraphai.webp" },
  { name: "DataForSEO", logo: "/logos/rotating/dataforseo.webp" },
  { name: "Ahrefs", logo: "/logos/rotating/ahrefs.webp" },
  { name: "Semrush", logo: "/logos/rotating/semrush.webp" },
  { name: "EmailListVerify", logo: "/logos/rotating/emaillistverify.webp" },
  { name: "Clearout", logo: "/logos/rotating/clearout.webp" },
  { name: "Reoon", logo: "/logos/rotating/reoon.webp" },
  { name: "MyEmailVerifier", logo: "/logos/rotating/myemailverifier.webp" },
  { name: "DeBounce", logo: "/logos/rotating/debounce.webp" },
  { name: "Bouncify", logo: "/logos/rotating/bouncify.webp" },
  { name: "RocketReach", logo: "/logos/rotating/rocketreach.webp" },
  { name: "Anymail Finder", logo: "/logos/rotating/anymailfinder.webp" },
  { name: "Wiza", logo: "/logos/rotating/wiza.webp" },
  { name: "Surfe", logo: "/logos/rotating/surfe.webp" },
  { name: "Lusha", logo: "/logos/rotating/lusha.webp" },
  { name: "Enrow", logo: "/logos/rotating/enrow.webp" },
  { name: "Dropcontact", logo: "/logos/rotating/dropcontact.webp" },
  { name: "ValueSERP", logo: "/logos/rotating/valueserp.webp" },
  { name: "SerpWow", logo: "/logos/rotating/serpwow.webp" },
  { name: "SearchApi", logo: "/logos/rotating/searchapi.webp" },
  { name: "Zenserp", logo: "/logos/rotating/zenserp.webp" },
  { name: "ScrapingAnt", logo: "/logos/rotating/scrapingant.webp" },
  { name: "Scrapfly", logo: "/logos/rotating/scrapfly.webp" },
  { name: "Captain Data", logo: "/logos/rotating/captaindata.webp" },
  { name: "ScrapeOps", logo: "/logos/rotating/scrapeops.webp" },
  { name: "NetNut", logo: "/logos/rotating/netnut.webp" },
  { name: "Outscraper", logo: "/logos/rotating/outscraper.webp" },
  { name: "Orthogonal", logo: "/logos/rotating/orthogonal.webp" },
  { name: "Tomba", logo: "/logos/rotating/tomba.webp" },
  { name: "Snov.io", logo: "/logos/rotating/snov.webp" },
  { name: "ContactOut", logo: "/logos/rotating/contactout.webp" },
  { name: "Oppora", logo: "/logos/rotating/oppora.webp" },
  { name: "Proxycurl", logo: "/logos/rotating/proxycurl.webp" },
  { name: "BetterContact", logo: "/logos/rotating/bettercontact.webp" },
  { name: "Shodan", logo: "/logos/rotating/shodan.webp" },
  { name: "Verifalia", logo: "/logos/rotating/verifalia.webp" },
]

type PreloadImage = {
  src: string
} & Partial<
  Pick<HTMLImageElement, "complete" | "decode" | "onerror" | "onload">
>

type PreloadImageFactory = () => PreloadImage

const createBrowserImage: PreloadImageFactory = () => new Image()

export async function preloadRotatingToolLogos(
  sources = ROTATING_TOOL_LOGOS.map((tool) => tool.logo),
  createImage: PreloadImageFactory = createBrowserImage
) {
  if (typeof Image === "undefined" && createImage === createBrowserImage) {
    return
  }

  const uniqueSources = [...new Set(sources)]

  await Promise.all(
    uniqueSources.map(
      (source) =>
        new Promise<void>((resolve) => {
          const image = createImage()

          if (typeof image.decode === "function") {
            image.src = source
            image.decode().then(resolve, resolve)
            return
          }

          image.onload = () => resolve()
          image.onerror = () => resolve()
          image.src = source

          if (image.complete) {
            resolve()
          }
        })
    )
  )
}

const INITIAL_TOOL_NAMES = [
  "Hunter",
  "OpenRouter",
  "Firecrawl",
  "Bright Data",
] as const

export const INITIAL_ROTATING_TOOL_INDEXES = INITIAL_TOOL_NAMES.map((name) =>
  ROTATING_TOOL_LOGOS.findIndex((tool) => tool.name === name)
)

export function shuffledIndexes(length: number, random = Math.random) {
  const indexes = Array.from({ length }, (_, index) => index)

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const value = indexes[index]
    indexes[index] = indexes[swapIndex]
    indexes[swapIndex] = value
  }

  return indexes
}

export function makeLogoQueue(
  visibleIndexes: readonly number[],
  random = Math.random
) {
  const visible = new Set(visibleIndexes)

  return shuffledIndexes(ROTATING_TOOL_LOGOS.length, random).filter(
    (index) => !visible.has(index)
  )
}

export function makeSlotQueue(random = Math.random) {
  return shuffledIndexes(ROTATING_TOOL_SLOT_COUNT, random)
}
