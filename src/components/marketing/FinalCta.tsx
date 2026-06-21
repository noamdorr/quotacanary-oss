import { CanaryCallout } from "@/components/marketing/CanaryCallout"
import { APP_SIGNUP_URL } from "@/components/marketing/constants"
import { COPY } from "@/components/marketing/copy"

export function FinalCta() {
  return (
    <section
      className="qc-final-cta"
      style={{
        padding: "126px 0 100px",
        background: "var(--cream-2)",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="container">
        <div className="qc-final-cta-panel">
          <CanaryCallout
            className="qc-final-cta-mascot"
            line="I warn you before credits run dry."
            mood="singing"
            revealOnHover
            size={118}
          />
          <h2
            className="f-display"
            style={{
              fontSize: "clamp(46px, 5.8vw, 78px)",
              margin: 0,
              lineHeight: 1.02,
            }}
          >
            <span>The bird that sings</span>
            <br />
            <em>before the credits die.</em>
          </h2>
          <p
            style={{
              fontSize: 18,
              color: "var(--ink-3)",
              marginTop: 26,
              maxWidth: 540,
              marginInline: "auto",
            }}
          >
            A few minutes of setup. Then stop learning about dead credits from
            broken workflows.
          </p>
          <div
            className="qc-final-cta-actions"
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              marginTop: 36,
            }}
          >
            <a
              href={APP_SIGNUP_URL}
              className="btn btn-primary"
              style={{
                padding: "16px 24px",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
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
          </div>
        </div>
      </div>
    </section>
  )
}
