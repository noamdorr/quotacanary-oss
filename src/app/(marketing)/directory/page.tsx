import { MarketingFooter } from "@/components/marketing/MarketingFooter"
import { MarketingNav } from "@/components/marketing/MarketingNav"
import { ToolsDirectory } from "@/components/marketing/ToolsDirectory"
import { getActiveTools } from "@/lib/db/tools"
import { sortToolsForDirectory } from "@/lib/marketing/tool-directory"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Every tool QuotaCanary watches - the credit-balance directory",
  description:
    "Browse every API tool QuotaCanary monitors for credit balance and burn rate. Find your tool and learn how to check its balance before it runs dry.",
}

// Rendered per request (the root layout reads the CSP nonce, which rules out
// a prerender); the catalog read is cached hourly in lib/db/tools so newly
// activated tools still appear without a redeploy.
export default async function DirectoryPage() {
  const tools = sortToolsForDirectory(await getActiveTools())
  return (
    <>
      <a href="#main-content" className="qc-skip-link">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content">
        <ToolsDirectory tools={tools} />
      </main>
      <MarketingFooter />
    </>
  )
}
