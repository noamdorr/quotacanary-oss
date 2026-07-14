import { PlausibleAnalytics } from "@/components/analytics/PlausibleAnalytics"
import { ConsoleEgg } from "@/components/brand/ConsoleEgg"
import { cn } from "@/lib/utils"
import type { Metadata } from "next"
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google"
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
    "The bird that sings before the credits die. Credit-balance monitoring for your whole API stack.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
  openGraph: {
    type: "website",
    siteName: "QuotaCanary",
    title: "QuotaCanary",
    description:
      "The bird that sings before the credits die. Credit-balance monitoring for your whole API stack.",
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
      "The bird that sings before the credits die. Credit-balance monitoring for your whole API stack.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn(inter.variable, fraunces.variable, jetbrainsMono.variable)}
    >
      <body className="bg-background antialiased">
        {children}
        <ConsoleEgg />
      </body>
      <PlausibleAnalytics />
    </html>
  )
}
