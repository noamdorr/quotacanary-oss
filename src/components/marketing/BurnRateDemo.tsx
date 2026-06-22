import { StatusPill } from "@/components/dashboard/StatusPill"
import { HERO_DEMO_TOOLS } from "@/lib/marketing-demo-tools"

interface BurnRateDemoProps {
  className?: string
}

export function BurnRateDemo({ className }: BurnRateDemoProps) {
  return (
    <div
      className={`card${className ? ` ${className}` : ""}`}
      style={{
        padding: 28,
        background: "var(--cream)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "grid", gap: 10 }}>
        {HERO_DEMO_TOOLS.map((row) => (
          <div key={row.name} className="qc-demo-row">
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 24,
                    height: 24,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid var(--hairline-soft)",
                    borderRadius: 6,
                    background: "rgba(255,253,245,0.7)",
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={row.logo}
                    alt=""
                    width={16}
                    height={16}
                    style={{
                      width: 16,
                      height: 16,
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                </span>
                <span style={{ fontWeight: 650, fontSize: 14 }}>
                  {row.name}
                </span>
                <StatusPill status={row.status} />
              </div>
              <div
                className="f-mono"
                style={{ color: "var(--ink-3)", fontSize: 12 }}
              >
                {row.balance}
              </div>
            </div>
            <div
              className="f-mono qc-demo-eta"
              style={{
                color:
                  row.status.level === "critical"
                    ? "var(--dry)"
                    : row.status.level === "low"
                      ? "var(--low-text)"
                      : "var(--ink-3)",
              }}
            >
              {row.eta}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
