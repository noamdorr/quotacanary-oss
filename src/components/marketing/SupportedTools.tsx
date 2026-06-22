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
            If a tool bills you by the credit, the canary is watching it.
          </p>
        </div>
      </div>

      <RotatingToolLogos />

      <div className="container" style={{ textAlign: "center", marginTop: 44 }}>
        <a href="/directory" className="btn btn-ghost">
          See all tools
        </a>
      </div>
    </section>
  )
}
