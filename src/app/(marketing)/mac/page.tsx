import { Canary } from "@/components/brand/Canary"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { COPY } from "@/components/marketing/copy"
import type { Metadata } from "next"

// /mac (QUO-191): the Mac app page and the connected-mode story. All copy is
// staged in COPY.mac. No openGraph block on purpose: Next replaces the root
// layout's openGraph wholesale instead of deep-merging it, so a page-level
// block here would drop /og.jpg, siteName and type. Leaving it out inherits
// the site default, the same way /security does.
export const metadata: Metadata = {
  title: COPY.mac.pageTitle,
  description: COPY.mac.pageDescription,
}

const FACT_HEADING: React.CSSProperties = {
  fontSize: 22,
  margin: "0 0 10px",
}

const FACT_BODY: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.6,
  color: "var(--ink-3)",
  margin: 0,
}

export default function MacPage() {
  return (
    <>
      <a href="#main-content" className="qc-skip-link">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content">
        <section style={{ padding: "84px 0 64px" }}>
          <div className="container">
            <div className="qc-grid-2">
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>
                  {COPY.mac.pageEyebrow}
                </div>
                <h1
                  className="f-display"
                  style={{
                    fontSize: "clamp(42px, 6vw, 76px)",
                    margin: 0,
                    maxWidth: 620,
                  }}
                >
                  {COPY.mac.pageHeadline}
                </h1>
                <p
                  style={{
                    maxWidth: 580,
                    fontSize: 17,
                    lineHeight: 1.6,
                    color: "var(--ink-2, var(--ink))",
                    margin: "22px 0 0",
                  }}
                >
                  {COPY.mac.pageWhat}
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <Canary mood="perched" size={220} />
              </div>
            </div>
          </div>
        </section>

        <section
          id="two-ways"
          style={{ padding: "72px 0 96px", background: "var(--cream-2)" }}
        >
          <div className="container">
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              {COPY.mac.twoWaysEyebrow}
            </div>
            <h2
              className="f-display"
              style={{
                fontSize: "clamp(32px, 4vw, 48px)",
                margin: 0,
                maxWidth: 680,
              }}
            >
              {COPY.mac.twoWaysHeading}
            </h2>
            <div
              className="qc-grid-2"
              style={{ marginTop: 36, alignItems: "stretch" }}
            >
              {[
                { title: COPY.mac.localTitle, body: COPY.mac.localBody },
                { title: COPY.mac.accountTitle, body: COPY.mac.accountBody },
              ].map((way) => (
                <div key={way.title} className="card" style={{ padding: 28 }}>
                  <h3 className="f-display" style={{ fontSize: 26, margin: 0 }}>
                    {way.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 16,
                      lineHeight: 1.6,
                      color: "var(--ink-2, var(--ink))",
                      margin: "12px 0 0",
                    }}
                  >
                    {way.body}
                  </p>
                </div>
              ))}
            </div>
            <div style={{ maxWidth: 720, marginTop: 48 }}>
              <h3 className="f-display" style={{ fontSize: 24, margin: 0 }}>
                {COPY.mac.storyHeading}
              </h3>
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gap: 14,
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: "var(--ink-2, var(--ink))",
                }}
              >
                {COPY.mac.connectedStory.map((paragraph) => (
                  <p key={paragraph} style={{ margin: 0 }}>
                    {paragraph}
                  </p>
                ))}
              </div>
              <p
                style={{
                  marginTop: 18,
                  marginBottom: 0,
                  fontSize: 14,
                  color: "var(--ink-3)",
                }}
              >
                How keys are handled on both sides is on the{" "}
                <a href="/security" style={{ textDecoration: "underline" }}>
                  security page
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <section style={{ padding: "72px 0 96px" }}>
          <div className="container">
            <div className="qc-grid-3">
              <div className="card" style={{ padding: 24 }}>
                <h2 className="f-display" style={FACT_HEADING}>
                  {COPY.mac.requirementsHeading}
                </h2>
                <p style={FACT_BODY}>{COPY.mac.requirements}</p>
              </div>
              <div
                className="card"
                style={{ padding: 24, background: "var(--cream-2)" }}
              >
                <h2 className="f-display" style={FACT_HEADING}>
                  {COPY.mac.leavesHeading}
                </h2>
                <p style={FACT_BODY}>{COPY.mac.leaves}</p>
              </div>
              <div
                className="card"
                style={{
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <h2 className="f-display" style={FACT_HEADING}>
                  {COPY.mac.downloadHeading}
                </h2>
                {/* Deliberately not a link: there is no public build yet. */}
                <span
                  className="btn btn-ghost"
                  aria-disabled="true"
                  style={{
                    alignSelf: "flex-start",
                    cursor: "default",
                    color: "var(--ink-3)",
                  }}
                >
                  {COPY.mac.downloadButton}
                </span>
                <p style={FACT_BODY}>{COPY.mac.downloadNote}</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  )
}
