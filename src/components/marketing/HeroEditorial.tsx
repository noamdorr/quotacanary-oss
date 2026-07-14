import { BurnRateDemo } from "@/components/marketing/BurnRateDemo"
import { HeroMascot } from "@/components/marketing/HeroMascot"
import { LaunchVideoDialog } from "@/components/marketing/LaunchVideoDialog"
import { APP_SIGNUP_URL } from "@/components/marketing/constants"
import { COPY } from "@/components/marketing/copy"

export function HeroEditorial() {
  return (
    <section style={{ padding: "72px 0 72px" }}>
      <div className="container qc-hero-grid">
        {/* LEFT: copy + CTAs */}
        <div className="rise-in qc-hero-copy">
          <div className="eyebrow" style={{ marginBottom: 18 }}>
            {COPY.heroEyebrow}
          </div>

          <h1
            className="f-display"
            style={{ fontSize: "clamp(48px, 6.5vw, 92px)", margin: 0 }}
          >
            {COPY.heroHeadline.lead}
            <em>{COPY.heroHeadline.em}</em>
            {COPY.heroHeadline.tail}
          </h1>

          <p
            style={{
              fontSize: 20,
              color: "var(--ink-3)",
              lineHeight: 1.45,
              maxWidth: 520,
              marginTop: 26,
            }}
          >
            {COPY.heroSub}
          </p>

          {/* CTA row */}
          <div
            className="qc-hero-cta"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 32,
              alignItems: "center",
            }}
          >
            <a
              href={APP_SIGNUP_URL}
              className="btn btn-primary"
              style={{ padding: "14px 20px", fontSize: 15 }}
            >
              {COPY.ctaPrimary}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </a>
            <LaunchVideoDialog />
          </div>
        </div>

        {/* RIGHT: mascot + demo card */}
        <div style={{ display: "grid", gap: 18, position: "relative" }}>
          <div className="qc-hero-demo-wrap">
            <HeroMascot />
            <BurnRateDemo />
          </div>
        </div>
      </div>
    </section>
  )
}
