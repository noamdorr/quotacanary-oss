import { Canary } from "@/components/brand/Canary"

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
          <Canary mood="perched" size={36} />
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
              Solo founder. Builds GTM tools.{" "}
              <a
                href="https://x.com/dordim"
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  color: "inherit",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                @dordim
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
