import { Canary } from "@/components/brand/Canary"
import { COPY } from "@/components/marketing/copy"

export function MarketingFooter() {
  return (
    <footer
      style={{
        padding: "40px 0 28px",
        background: "var(--cream)",
        borderTop: "1px solid var(--hairline)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Canary mood="perched" size={22} />
          <span
            style={{
              fontFamily: "var(--f-display)",
              fontWeight: 500,
              fontSize: 15,
            }}
          >
            QuotaCanary
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              marginLeft: 8,
            }}
          >
            {COPY.footerNote}
          </span>
        </div>
        <nav
          style={{
            display: "flex",
            gap: 22,
            fontSize: 13,
            color: "var(--ink-3)",
          }}
          aria-label="Footer"
        >
          {[
            { label: "How it works", href: "/#how" },
            { label: "Tools", href: "/directory" },
            { label: "Why this exists", href: "/#why" },
            { label: "FAQ", href: "/#faq" },
            { label: "Docs", href: "/docs" },
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              style={{
                color: "inherit",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                minHeight: 40,
                padding: "4px 2px",
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
