export function FounderNote() {
  return (
    <section id="why" style={{ padding: "100px 0" }}>
      <div
        className="container"
        style={{ maxWidth: 680, marginInline: "auto" }}
      >
        <div className="eyebrow" style={{ marginBottom: 18 }}>
          Why this exists
        </div>
        <p
          className="f-display"
          style={{
            fontSize: "clamp(20px, 2.4vw, 26px)",
            lineHeight: 1.45,
            margin: 0,
            fontWeight: 450,
          }}
        >
          I run cold outreach pipelines for a living. Every few weeks a campaign
          would die at 3am, and after an hour of digging the cause was always
          the same: one vendor out of ten had quietly run out of credits. Some
          tools auto-top-up. Some send a warning email. The rest just stop.
        </p>
        <p
          style={{
            fontSize: 17,
            color: "var(--ink-3)",
            lineHeight: 1.6,
            marginTop: 22,
            marginBottom: 0,
          }}
        >
          QuotaCanary is the thing I kept wishing existed: one page that watches
          every balance and says something while there&apos;s still time. I run
          it on my own stack every day. If it saves one of your campaigns, tell
          someone. That&apos;s the entire growth strategy.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 30,
          }}
        >
          <img
            src="/founder-noam.png"
            alt="Noam Dorr"
            width={48}
            height={48}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid var(--hairline)",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              <a
                href="https://www.linkedin.com/in/noam-dorokhov/"
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  color: "inherit",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationColor: "var(--canary-deep)",
                }}
              >
                Noam Dorr
              </a>
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Co-founder of{" "}
              <a
                href="https://reechee.io"
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  color: "inherit",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                Reechee
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
