import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { APP_SIGNUP_URL } from "@/components/marketing/constants"
import { getActiveTools, getToolById } from "@/lib/db/tools"
import {
  categoryLabel,
  toolSubheading,
  toolWebsiteUrl,
} from "@/lib/marketing/tool-directory"
import { withUtm } from "@/lib/marketing/utm"
import { ArrowLeft, ExternalLink } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"

// Pre-render known tools at build time, but render newly added tools on first
// request (notFound() below still 404s unknown ids), and refresh hourly.
export const dynamicParams = true
export const revalidate = 3600

export async function generateStaticParams() {
  const tools = await getActiveTools()
  return tools.map((t) => ({ id: t.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const tool = await getToolById(id)
  if (!tool) return {}
  const title = `${tool.name} credit balance - check it and get warned before it runs dry`
  const description =
    tool.description ??
    `${toolSubheading(tool.name)}. QuotaCanary watches your ${tool.name} credits and warns you before they run out.`
  return {
    title,
    description,
    alternates: { canonical: `/directory/${tool.id}` },
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: "/og.jpg",
          width: 1920,
          height: 1080,
          alt: "QuotaCanary - the bird that sings before the credits die",
        },
      ],
    },
  }
}

export default async function ToolDirectoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const tool = await getToolById(id)
  if (!tool) notFound()

  const topupUrl = withUtm(tool.topup_url, { medium: "tool-page" })
  const websiteUrl = toolWebsiteUrl(tool)
  const websiteLink = withUtm(websiteUrl, {
    medium: "tool-page",
    campaign: "website",
  })
  const signupUrl = `${APP_SIGNUP_URL}&tool=${tool.id}`

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    applicationCategory: categoryLabel(tool.category),
    ...(tool.description ? { description: tool.description } : {}),
    ...(websiteUrl ? { url: websiteUrl } : {}),
  }

  return (
    <>
      <a href="#main-content" className="qc-skip-link">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content">
        <article style={{ padding: "64px 0" }}>
          <div className="container" style={{ maxWidth: 760 }}>
            <a
              href="/directory"
              className="f-mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--ink-3)",
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={14} strokeWidth={2.2} aria-hidden />
              All tools
            </a>

            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 20,
              }}
            >
              {tool.logo_url ? (
                <img
                  src={tool.logo_url}
                  alt=""
                  width={40}
                  height={40}
                  style={{ width: 40, height: 40, objectFit: "contain" }}
                />
              ) : null}
              <div>
                <h1
                  className="f-display"
                  style={{ fontSize: "clamp(26px, 3.4vw, 38px)", margin: 0 }}
                >
                  {tool.name}
                </h1>
                <div
                  className="f-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginTop: 4,
                  }}
                >
                  {categoryLabel(tool.category)}
                </div>
              </div>
            </header>

            <p
              style={{
                fontSize: 18,
                color: "var(--ink-2)",
                marginTop: 18,
                fontWeight: 500,
              }}
            >
              {toolSubheading(tool.name)}
            </p>

            {tool.description ? (
              <p style={{ fontSize: 15, color: "var(--ink-3)", marginTop: 10 }}>
                {tool.description}
              </p>
            ) : null}

            {tool.pools && tool.pools.length > 1 ? (
              <Section label="Metered on">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tool.pools.map((p) => (
                    <span
                      key={p.credit_type}
                      style={{
                        border: "1px solid var(--hairline)",
                        borderRadius: 8,
                        padding: "4px 10px",
                        fontSize: 13,
                        background: "var(--cream)",
                      }}
                    >
                      {p.label}
                    </span>
                  ))}
                </div>
              </Section>
            ) : null}

            {tool.key_instructions ? (
              <Section label="Find your API key">
                <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
                  {tool.key_instructions}
                </p>
              </Section>
            ) : null}

            <Section label="Balance warnings">
              <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
                QuotaCanary checks your {tool.name} balance in the background
                and warns you before it gets too close to zero.
              </p>
            </Section>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 28,
              }}
            >
              <a href={signupUrl} className="btn btn-primary">
                Watch {tool.name} run dry, free
              </a>
              {websiteUrl ? (
                <a
                  href={websiteLink}
                  className="btn btn-ghost"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Website
                  <ExternalLink size={14} strokeWidth={2.2} aria-hidden />
                </a>
              ) : null}
              {tool.topup_url ? (
                <a
                  href={topupUrl}
                  className="btn btn-ghost"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get more
                </a>
              ) : null}
              {tool.api_docs_url ? (
                <a
                  href={tool.api_docs_url}
                  className="btn btn-ghost"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  API docs
                  <ExternalLink size={14} strokeWidth={2.2} aria-hidden />
                </a>
              ) : null}
            </div>
          </div>
        </article>
      </main>
      <MarketingFooter />
      <script type="application/ld+json">
        {JSON.stringify(jsonLd).replace(/</g, "\\u003c")}
      </script>
    </>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div
        className="f-mono"
        style={{
          fontSize: 10,
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
