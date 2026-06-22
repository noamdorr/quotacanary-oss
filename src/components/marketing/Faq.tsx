"use client"

import { type ReactNode, useState } from "react"

const FAQS = [
  {
    q: "What can you do that the tool's own dashboard can't?",
    a: 'Three things. We translate balances into deadlines ("burns out next Thursday," not "120 left"), watch every tool at once instead of making you check seven tabs, and warn you before the credits hit zero. That\'s the whole product.',
  },
  {
    q: "Will it send me notifications I don't want?",
    a: "By default, one low warning while there's still time, and one critical alert when it's gone. That's it. You can turn up the volume, but we'd rather you didn't have to.",
  },
  {
    q: "Does it touch my data, sends, or campaigns?",
    a: "No. We only read the usage endpoint. We don't ingest contacts, see message bodies, or touch outbound. Read-only on the smallest possible scope, every time.",
  },
  {
    q: "Which tools don't you track?",
    a: "QuotaCanary tracks tools that expose quota through a simple read-only API call. We don't track dashboard-only or traffic-header-only platforms like RapidAPI and Apollo today, because that turns a free tool into a science project. If they add a clean quota endpoint, we'll add them.",
  },
  {
    q: "Can I pull my balances into my own scripts or agent?",
    a: (
      <>
        Yes. There&apos;s a read-only REST API, a remote MCP server your agent
        can call, and outbound webhooks for the alerts themselves. Same scope as
        everything else - it reads your balances and nothing more. Setup&apos;s
        in <a href="/docs">the docs</a>.
      </>
    ),
  },
  {
    q: "It's open source - can I inspect it and self-host?",
    a: (
      <>
        Yes to both. The full source is{" "}
        <a
          href="https://github.com/noamdorr/quotacanary-oss"
          target="_blank"
          rel="noreferrer noopener"
        >
          on GitHub
        </a>
        , so you can read exactly what we do with your API keys instead of
        taking our word for it. Prefer to run the whole thing yourself? Fork it
        and self-host - your laptop, your own server, wherever you like. The
        hosted version stays free either way.
      </>
    ),
  },
  {
    q: "Why is it free?",
    a: "Polling your balances every 15 minutes costs us almost nothing, so we don't charge for it. If a paid tier ever shows up, it'll be for something genuinely expensive, and you'll see it coming long before it touches you.",
  },
  {
    q: "Why a canary?",
    a: "Birds in coal mines noticed bad air before the miners did, which gave everyone time to leave. Ours does the same job for credit balances. We added singing because it was cuter than the alternative.",
  },
]

function FaqItem({
  q,
  a,
  open,
  onToggle,
}: {
  q: string
  a: ReactNode
  open: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ borderBottom: "1px solid var(--hairline)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          appearance: "none",
          border: 0,
          background: "transparent",
          padding: "22px 0",
          width: "100%",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          cursor: "pointer",
        }}
      >
        <span
          className="f-display"
          style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em" }}
        >
          {q}
        </span>
        <span
          style={{
            transition: "transform .25s",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
            color: "var(--ink-3)",
            flexShrink: 0,
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <div
        aria-hidden={!open}
        style={{
          maxHeight: open ? 1000 : 0,
          overflow: "hidden",
          transition: "max-height .35s cubic-bezier(.4,.0,.2,1), opacity .25s",
          opacity: open ? 1 : 0,
        }}
      >
        <p
          className="qc-faq-answer"
          style={{
            fontSize: 15,
            color: "var(--ink-3)",
            margin: 0,
            paddingBottom: 22,
            maxWidth: 720,
            lineHeight: 1.55,
          }}
        >
          {a}
        </p>
      </div>
    </div>
  )
}

export function Faq() {
  const [open, setOpen] = useState<number>(0)

  return (
    <section id="faq" style={{ padding: "100px 0" }}>
      <div
        className="container"
        style={{ maxWidth: 760, marginInline: "auto" }}
      >
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          FAQ
        </div>
        <h2
          className="f-display"
          style={{
            fontSize: "clamp(34px, 4.2vw, 52px)",
            margin: "10px 0 40px",
          }}
        >
          Questions you&apos;d ask before handing over an API key.
        </h2>
        {FAQS.map((f, i) => (
          <FaqItem
            key={f.q}
            q={f.q}
            a={f.a}
            open={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  )
}
