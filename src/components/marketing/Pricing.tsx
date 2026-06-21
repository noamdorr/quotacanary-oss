import { APP_SIGNUP_URL } from "@/components/marketing/constants"
import { COPY } from "@/components/marketing/copy"

export function Pricing() {
  return (
    <section
      id="pricing"
      style={{ padding: "100px 0", background: "var(--cream-2)" }}
    >
      <div
        className="container"
        style={{ maxWidth: 720, marginInline: "auto", textAlign: "center" }}
      >
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          Pricing
        </div>
        <h2
          className="f-display"
          style={{
            fontSize: "clamp(48px, 7vw, 96px)",
            margin: "10px 0 0",
            lineHeight: 1,
          }}
        >
          {COPY.pricingHeadline.split(",")[0]}
          <em>,</em>
          <br />
          <span style={{ color: "var(--ink-3)", fontSize: "0.55em" }}>
            {COPY.pricingHeadline.split(",").slice(1).join(",").trim()}
          </span>
        </h2>
        <div
          className="card"
          style={{
            maxWidth: 480,
            marginInline: "auto",
            marginTop: 40,
            padding: 32,
            textAlign: "left",
          }}
        >
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {COPY.pricingFeatures.map((feature) => (
              <li
                key={feature}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  fontSize: 15,
                  lineHeight: 1.45,
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--canary-deep)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0, marginTop: 1 }}
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <a
            href={APP_SIGNUP_URL}
            className="btn btn-primary"
            style={{
              marginTop: 28,
              padding: "16px 24px",
              fontSize: 15,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
            }}
          >
            {COPY.pricingCta}
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
          <p
            style={{
              fontSize: 13,
              color: "var(--ink-3)",
              marginTop: 16,
              marginBottom: 0,
              textAlign: "center",
            }}
          >
            {COPY.pricingFootnote}
          </p>
        </div>
      </div>
    </section>
  )
}
