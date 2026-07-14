import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import type { ReactNode } from "react"

// Shared shell for plain-text legal pages (/privacy, /terms).
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <>
      <a href="#main-content" className="qc-skip-link">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content">
        <article
          className="container qc-legal"
          style={{
            maxWidth: 720,
            marginInline: "auto",
            padding: "72px 0 96px",
          }}
        >
          <h1
            className="f-display"
            style={{ fontSize: "clamp(38px, 5vw, 56px)", margin: 0 }}
          >
            {title}
          </h1>
          <p
            className="f-mono"
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin: "14px 0 0",
            }}
          >
            Last updated: {updated}
          </p>
          <div style={{ marginTop: 40 }}>{children}</div>
        </article>
      </main>
      <MarketingFooter />
    </>
  )
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 className="f-display" style={{ fontSize: 24, margin: "0 0 12px" }}>
        {heading}
      </h2>
      <div
        style={{
          fontSize: 15,
          lineHeight: 1.65,
          color: "var(--ink-2, var(--ink))",
          display: "grid",
          gap: 12,
        }}
      >
        {children}
      </div>
    </section>
  )
}
