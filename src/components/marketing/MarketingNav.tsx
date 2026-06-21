"use client"

import { APP_LOGIN_URL, APP_SIGNUP_URL } from "@/components/marketing/constants"
import { Menu, X } from "lucide-react"
import { useState } from "react"

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/directory", label: "Supported tools" },
  { href: "/#pricing", label: "Pricing - it's free" },
  { href: "/#faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
]

export function MarketingNav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="qc-nav" aria-label="Main">
      <div className="qc-nav-inner">
        <a href="/" className="qc-nav-logo">
          <img
            src="/logo.png"
            alt="QuotaCanary"
            width="122"
            height="27"
            style={{ width: 122, height: 27 }}
          />
        </a>

        {/* Nav links (desktop) */}
        <div className="qc-nav-links">
          <a href="/#how" className="nav-item">
            How it works
          </a>
          <a href="/directory" className="nav-item">
            Supported tools
          </a>
          <a href="/#pricing" className="nav-item pricing-gag">
            <span className="label-1">Pricing</span>
            <span className="label-2">It&apos;s free!</span>
          </a>
          <a href="/#faq" className="nav-item">
            FAQ
          </a>
          <a href="/docs" className="nav-item">
            Docs
          </a>
        </div>

        {/* Right-side CTAs */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <a href={APP_LOGIN_URL} className="btn btn-link qc-nav-signin">
            Sign in
          </a>
          <a href={APP_SIGNUP_URL} className="btn btn-primary qc-nav-cta">
            Sign up for free
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
          <button
            type="button"
            className="qc-nav-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="qc-mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div id="qc-mobile-menu" className="qc-nav-mobile">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <a href={APP_LOGIN_URL} onClick={() => setOpen(false)}>
            Sign in
          </a>
          <a
            href={APP_SIGNUP_URL}
            onClick={() => setOpen(false)}
            className="btn btn-primary"
          >
            Sign up for free
          </a>
        </div>
      )}
    </nav>
  )
}
