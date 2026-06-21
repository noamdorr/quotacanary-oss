export const SIGNATURE_RISK_CARD = {
  name: "Hunter.io",
  logo: "/logos/hunter.png",
  balance: "120",
  unit: "searches left",
  verdict: "burns out tomorrow",
  burnRate: "240 / day",
  threshold: "500 searches",
  note: "Top up before lunch. I dislike drama.",
  metrics: [
    { label: "Balance", value: "120 searches" },
    { label: "Burn rate", value: "240 / day" },
    { label: "Warning at", value: "500 searches" },
  ],
  sparkline: [82, 78, 71, 65, 53, 44, 32, 21, 12],
} as const
