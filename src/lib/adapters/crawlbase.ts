import { finiteOrNull, timedFetch } from "./shared"
import type { AdapterResult, ToolAdapter } from "./types"

type CrawlbaseCredentials = {
  token: string
  product: CrawlbaseProduct
}

type CrawlbaseProduct =
  | "crawling-api"
  | "crawler"
  | "smartproxy"
  | "scraper-api"
  | "leads-api"
  | "screenshot-api"

type CrawlbaseResponse = {
  remainingCredits?: unknown
}

const PRODUCT_LABELS: Record<CrawlbaseProduct, string> = {
  "crawling-api": "Crawling API",
  crawler: "Enterprise Crawler",
  smartproxy: "Smart AI Proxy",
  "scraper-api": "Scraper API",
  "leads-api": "Leads API",
  "screenshot-api": "Screenshots API",
}

function isProduct(value: string): value is CrawlbaseProduct {
  return Object.hasOwn(PRODUCT_LABELS, value)
}

function parseCredentials(secret: string): CrawlbaseCredentials | null {
  try {
    const parsed = JSON.parse(secret) as { token?: unknown; product?: unknown }
    const product =
      typeof parsed.product === "string" ? parsed.product.trim() : ""
    if (
      typeof parsed.token === "string" &&
      parsed.token.trim() &&
      isProduct(product)
    ) {
      return {
        token: parsed.token.trim(),
        product,
      }
    }
  } catch {
    return null
  }

  return null
}

export const crawlbaseAdapter: ToolAdapter = {
  toolId: "crawlbase",
  async readBalance(secret: string): Promise<AdapterResult> {
    const credentials = parseCredentials(secret)
    if (!credentials) {
      return {
        ok: false,
        error: "Crawlbase needs a token and product slug.",
      }
    }

    let res: Response
    try {
      // SECURITY: Crawlbase's Account API documents token auth as a query parameter, so the
      // key can surface in vendor request logs/proxies. Residual exposure; see 2026-06-22 audit.
      res = await timedFetch(
        `https://api.crawlbase.com/account?${new URLSearchParams({
          token: credentials.token,
          product: credentials.product,
        })}`
      )
    } catch {
      return { ok: false, error: "Couldn't reach Crawlbase." }
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Crawlbase rejected these credentials." }
    }
    if (!res.ok)
      return { ok: false, error: `Crawlbase returned ${res.status}.` }

    let data: CrawlbaseResponse
    try {
      data = await res.json()
    } catch {
      return { ok: false, error: "Crawlbase returned an unexpected response." }
    }

    const balance = finiteOrNull(data?.remainingCredits)
    if (balance === null) {
      return { ok: false, error: "Crawlbase returned an unexpected response." }
    }

    return {
      ok: true,
      balances: [
        {
          creditType: "credits",
          label: `${PRODUCT_LABELS[credentials.product]} Credits`,
          balance,
          balanceLimit: null,
          unit: "credits",
        },
      ],
    }
  },
}
