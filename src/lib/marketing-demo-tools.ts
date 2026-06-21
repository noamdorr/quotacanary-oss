import type { EffectiveStatus } from "@/lib/balance-status"

type HeroDemoStatus = Extract<EffectiveStatus, { kind: "level" }>

export type HeroDemoTool = {
  name: string
  logo: string
  balance: string
  eta: string
  status: HeroDemoStatus
}

export const HERO_DEMO_TOOLS: HeroDemoTool[] = [
  {
    name: "Hunter.io",
    logo: "/logos/hunter.png",
    balance: "120 / 5,000",
    eta: "burns out tomorrow",
    status: { kind: "level", level: "critical" },
  },
  {
    name: "OpenRouter",
    logo: "/logos/openrouter.png",
    balance: "$8.20",
    eta: "~2 days left",
    status: { kind: "level", level: "low" },
  },
  {
    name: "NeverBounce",
    logo: "/logos/neverbounce.png",
    balance: "18,400",
    eta: "~3 weeks left",
    status: { kind: "level", level: "healthy" },
  },
  {
    name: "ScraperAPI",
    logo: "/logos/scraperapi.png",
    balance: "14,200 req",
    eta: "~16 days left",
    status: { kind: "level", level: "healthy" },
  },
  {
    name: "Bright Data",
    logo: "/logos/brightdata.png",
    balance: "$42.10",
    eta: "burns out Friday",
    status: { kind: "level", level: "low" },
  },
]
