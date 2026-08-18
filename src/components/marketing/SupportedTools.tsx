import { RotatingToolLogos } from "@/components/marketing/RotatingToolLogos"

export function SupportedTools() {
  return (
    <section
      id="tools"
      style={{
        padding: "80px 0",
        borderTop: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline)",
        background: "var(--cream-2)",
        overflow: "hidden",
      }}
    >
      <div className="container">
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            60+ tools watched
          </div>
          <h2
            className="f-display"
            style={{
              fontSize: "clamp(28px, 3.6vw, 44px)",
              margin: 0,
              maxWidth: 640,
              marginInline: "auto",
            }}
          >
            A bird&apos;s-eye view of your credit stack.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--ink-3)",
              marginTop: 16,
              maxWidth: 520,
              marginInline: "auto",
            }}
          >
            If it&apos;s in the directory, the canary is watching it. If it
            isn&apos;t, tell us and we&apos;ll take a look.
          </p>
        </div>
      </div>

      <RotatingToolLogos />

      <div className="container" style={{ textAlign: "center", marginTop: 44 }}>
        <a href="/directory" className="btn btn-ghost">
          See all tools
        </a>
        <p style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 16 }}>
          Don&apos;t see yours?{" "}
          <a href="mailto:hey@quotacanary.com?subject=Tool%20request">
            Ask for it
          </a>
          , or{" "}
          <a
            href="https://github.com/noamdorr/quotacanary-oss/blob/master/CONTRIBUTING.md"
            target="_blank"
            rel="noreferrer noopener"
          >
            add it yourself
          </a>{" "}
          - an adapter is three small files.
        </p>
      </div>
    </section>
  )
}
