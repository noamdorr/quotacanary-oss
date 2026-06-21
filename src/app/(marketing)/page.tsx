import { Faq } from "@/components/marketing/Faq"
import { FinalCta } from "@/components/marketing/FinalCta"
import { FounderNote } from "@/components/marketing/FounderNote"
import { HeroEditorial } from "@/components/marketing/HeroEditorial"
import { HowItWorks } from "@/components/marketing/HowItWorks"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { Pricing } from "@/components/marketing/Pricing"
import { SupportedTools } from "@/components/marketing/SupportedTools"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "QuotaCanary - credit monitoring for your API stack",
  description:
    "The bird that sings before the credits die. Watch every credit balance in your stack and get warned before any of them runs dry.",
  openGraph: {
    title: "QuotaCanary",
    description:
      "The bird that sings before the credits die. Credit monitoring for your whole API stack.",
    type: "website",
  },
  twitter: { card: "summary" },
}

export default function MarketingHome() {
  return (
    <>
      <a href="#main-content" className="qc-skip-link">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content">
        <HeroEditorial />
        <SupportedTools />
        <HowItWorks />
        <Pricing />
        <FounderNote />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </>
  )
}
