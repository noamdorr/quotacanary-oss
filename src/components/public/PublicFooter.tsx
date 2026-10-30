import { LogoMark } from "@/components/brand/LogoMark"
import { MARKETING_URL } from "@/lib/site-links"

export function PublicFooter() {
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
          <LogoMark height={22} />
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
            © 2026 QuotaCanary.
          </span>
        </div>
        <nav
          className="qc-footer-nav"
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
          }}
          aria-label="Footer"
        >
          {[
            { label: "Docs", href: "/docs" },
            { label: "Security", href: "/security" },
            { label: "Privacy", href: `${MARKETING_URL}/privacy` },
            { label: "Terms", href: `${MARKETING_URL}/terms` },
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
