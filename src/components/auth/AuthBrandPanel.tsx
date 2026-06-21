import { Canary } from "@/components/brand/Canary"
import { MASCOT_LINES } from "@/lib/marketing-mascot"
import { SIGNATURE_RISK_CARD } from "@/lib/marketing-risk-card"

const sparklinePoints = SIGNATURE_RISK_CARD.sparkline
  .map((point, index) => `${index * 12},${100 - point}`)
  .join(" ")

export function AuthBrandPanel() {
  return (
    <div className="qc-auth-brand-panel relative hidden flex-col justify-center overflow-hidden px-12 py-10 lg:flex">
      <div className="qc-auth-showcase">
        <div className="qc-auth-mascot">
          <span className="qc-auth-bubble">{MASCOT_LINES.auth}</span>
          <Canary mood="singing" size={100} />
        </div>

        <div className="eyebrow text-[var(--canary)]">What you get</div>

        <h2 className="qc-auth-headline f-display">
          The bird that sings <em>before</em> the credits die.
        </h2>

        <p className="qc-auth-copy">
          One dashboard for every tool that bills you by the credit. Connect the
          keys, then let the canary watch the burn rate.
        </p>

        <div className="qc-auth-risk-card" aria-label="Demo credit alert">
          <div className="qc-auth-risk-top">
            <span className="qc-auth-tool-logo" aria-hidden="true">
              <img
                src={SIGNATURE_RISK_CARD.logo}
                alt=""
                width={24}
                height={24}
              />
            </span>
            <div>
              <div className="qc-auth-risk-name">
                {SIGNATURE_RISK_CARD.name}
              </div>
              <div className="qc-auth-risk-meta">highest risk today</div>
            </div>
          </div>

          <div className="qc-auth-balance-row">
            <span className="qc-auth-balance">
              {SIGNATURE_RISK_CARD.balance}
            </span>
            <span className="qc-auth-unit">{SIGNATURE_RISK_CARD.unit}</span>
          </div>

          <svg
            viewBox="0 0 96 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="qc-auth-sparkline"
          >
            <path
              d="M0 74 H96"
              stroke="rgba(255,196,0,0.24)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <polyline
              points={sparklinePoints}
              fill="none"
              stroke="var(--canary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="96" cy="88" r="4" fill="var(--canary)" />
          </svg>

          <div className="qc-auth-verdict">{SIGNATURE_RISK_CARD.verdict}</div>
        </div>

        <div className="qc-auth-trust">
          <span>Read-only access</span>
          <span>No sends touched</span>
        </div>
      </div>
    </div>
  )
}
