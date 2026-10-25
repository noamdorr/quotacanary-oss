import { Canary } from "@/components/brand/Canary"
import { COPY } from "@/components/marketing/copy"

// Homepage pointer to /mac (QUO-191). Copy is staged in COPY.mac; this
// component only lays it out.
export function MacSection() {
  return (
    <section id="mac" style={{ padding: "100px 0" }}>
      <div className="container">
        <div className="qc-grid-2">
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {COPY.mac.sectionEyebrow}
            </div>
            <h2
              className="f-display"
              style={{
                fontSize: "clamp(36px, 4.5vw, 56px)",
                margin: 0,
                maxWidth: 560,
              }}
            >
              {COPY.mac.sectionHeadline}
            </h2>
            <p
              style={{
                maxWidth: 560,
                color: "var(--ink-3)",
                fontSize: 16,
                lineHeight: 1.6,
                margin: "18px 0 0",
              }}
            >
              {COPY.mac.sectionBody}
            </p>
            <a
              href="/mac"
              className="btn btn-ghost"
              style={{ marginTop: 28, padding: "12px 18px" }}
            >
              {COPY.mac.sectionCta}
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
          <div
            className="card"
            style={{
              padding: 24,
              background: "var(--cream-2)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <MenuBarMock />
          </div>
        </div>
      </div>
    </section>
  )
}

// A static sketch of the menu bar, so the section shows where the bird lives
// without shipping a screenshot of an unreleased build.
function MenuBarMock() {
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 14,
          padding: "8px 12px",
          background: "var(--cream)",
          border: "1px solid var(--hairline)",
          borderRadius: 8,
          fontFamily: "var(--f-mono)",
          fontSize: 12,
          color: "var(--ink-3)",
        }}
      >
        <Canary mood="perched" size={22} />
        <span>Wed 09:41</span>
      </div>
      <div
        style={{
          background: "var(--cream)",
          border: "1px solid var(--hairline)",
          borderRadius: 10,
          padding: 14,
          display: "grid",
          gap: 10,
          fontSize: 13,
        }}
      >
        {[
          { name: "Hunter", left: "1,840 left", tone: "ok" },
          { name: "Apollo", left: "120 left", tone: "low" },
          { name: "Prospeo", left: "9,300 left", tone: "ok" },
        ].map((row) => (
          <div
            key={row.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontWeight: 500 }}>{row.name}</span>
            <span
              className="f-mono"
              style={{
                fontSize: 12,
                color:
                  row.tone === "low" ? "var(--canary-ink)" : "var(--ink-3)",
                background:
                  row.tone === "low" ? "rgba(255,196,0,0.14)" : "transparent",
                border:
                  row.tone === "low"
                    ? "1px solid rgba(255,196,0,0.4)"
                    : "1px solid transparent",
                padding: "3px 8px",
                borderRadius: 6,
              }}
            >
              {row.left}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
