import { PlausibleAnalytics } from "@/components/analytics/PlausibleAnalytics"
import { ConsoleEgg } from "@/components/brand/ConsoleEgg"
import { NONCE_HEADER } from "@/lib/csp"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google"
import { headers } from "next/headers"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

// Variable font. `wght` is included automatically; list the extra axes we use.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL("https://quotacanary.com"),
  title: "QuotaCanary",
  description:
    "The bird that sings before the credits die. Credit-balance monitoring for the API tools you connect.",
  icons: {
    // ?v=2: browsers cache icons past a normal reload; bump on a logo change.
    icon: [
      { url: "/favicon.ico?v=2", sizes: "32x32" },
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2" }],
  },
  openGraph: {
    type: "website",
    siteName: "QuotaCanary",
    title: "QuotaCanary",
    description:
      "The bird that sings before the credits die. Credit-balance monitoring for the API tools you connect.",
    url: "/",
    images: [
      {
        url: "/og.jpg",
        width: 1920,
        height: 1080,
        alt: "QuotaCanary - the bird that sings before the credits die",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QuotaCanary",
    description:
      "The bird that sings before the credits die. Credit-balance monitoring for the API tools you connect.",
    images: [
      {
        url: "/og.jpg",
        width: 1920,
        height: 1080,
        alt: "QuotaCanary - the bird that sings before the credits die",
      },
    ],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The per-request CSP nonce minted by the proxy. Reading the request here
  // also opts every route into dynamic rendering, which the nonce needs: Next
  // only stamps its inline scripts with it while rendering a live request,
  // never in a build-time prerender.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined

  return (
    <html
      lang="en"
      className={cn(inter.variable, fraunces.variable, jetbrainsMono.variable)}
    >
      <body className="bg-background antialiased">
        {children}
        <ConsoleEgg />
      </body>
      <PlausibleAnalytics nonce={nonce} />
    </html>
  )
}
