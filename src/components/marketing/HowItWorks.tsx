import { Canary } from "@/components/brand/Canary"

const steps = [
  {
    n: "01",
    title: "Connect your stack.",
    body: "An API key. We read your balances and nothing else - not your sends, not your contacts, not your message bodies.",
    mood: "perched" as const,
  },
  {
    n: "02",
    title: "We watch. Quietly.",
    body: "Every 15 minutes we check what you've got left, and how fast it's draining. The math is unforgiving.",
    mood: "alert" as const,
  },
  {
    n: "03",
    title: "The bird warns you while there's still time.",
    body: "Before a tool runs dry, not the morning after. Enough lead time to top up before anything breaks.",
    mood: "singing" as const,
  },
]

export function HowItWorks() {
  return (
    <section id="how" style={{ padding: "100px 0" }}>
      <div className="container">
        <div style={{ marginBottom: 44 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            How it works
          </div>
          <h2
            className="f-display"
            style={{
              fontSize: "clamp(36px, 4.5vw, 56px)",
              margin: 0,
              maxWidth: 720,
            }}
          >
            Three steps. Then we never bother you, until we have to.
          </h2>
          <p
            style={{
              maxWidth: 560,
              color: "var(--ink-3)",
              fontSize: 15,
              margin: "16px 0 0",
            }}
          >
            The whole job: you never learn a tool died by watching a campaign
            fail. A balance is a number. A deadline is something you can act on,
            so that&apos;s what we give you.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginTop: 22,
            }}
          >
            <code
              className="f-mono"
              style={{
                background: "var(--cream-2)",
                border: "1px solid var(--hairline)",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              120 left, burning 240/day
            </code>
            <span
              aria-hidden="true"
              style={{
                color: "var(--canary-deep)",
                fontFamily: "var(--f-mono)",
              }}
            >
              →
            </span>
            <code
              className="f-mono"
              style={{
                background: "rgba(255,196,0,0.12)",
                color: "var(--canary-deep)",
                border: "1px solid rgba(255,196,0,0.4)",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              burns out tomorrow
            </code>
          </div>
        </div>

        <div className="qc-grid-3">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="card"
              style={{
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 20,
                minHeight: 320,
                background: i === 1 ? "var(--cream-2)" : "var(--cream)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <span
                  className="f-mono"
                  style={{
                    fontSize: 12,
                    color: "var(--ink-3)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {s.n}
                </span>
                <Canary mood={s.mood} size={64} />
              </div>
              <div style={{ marginTop: "auto" }}>
                <h3 className="f-display" style={{ fontSize: 24, margin: 0 }}>
                  {s.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: "var(--ink-3)",
                    marginTop: 10,
                    marginBottom: 0,
                    lineHeight: 1.55,
                  }}
                >
                  {s.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
