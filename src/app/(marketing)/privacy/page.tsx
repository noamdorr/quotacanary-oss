import { LegalPage, LegalSection } from "@/components/marketing/LegalPage"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy policy - QuotaCanary",
  description:
    "What QuotaCanary collects, what it never touches, and how to get your data deleted.",
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="June 14, 2026">
      <p style={{ fontSize: 16, lineHeight: 1.65, margin: 0 }}>
        QuotaCanary watches credit balances so you don&apos;t have to. Doing
        that requires holding a small amount of your data. This page lists all
        of it, in plain English, because you are about to hand us API keys and
        deserve a straight answer about what happens to them.
      </p>

      <LegalSection heading="The short version">
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            listStyle: "disc",
            display: "grid",
            gap: 8,
          }}
        >
          <li>
            We store your email, the API credentials you connect (encrypted),
            and the balance readings we fetch with them.
          </li>
          <li>
            We never read your contacts, leads, messages, or campaigns. We call
            read-only balance endpoints and nothing else.
          </li>
          <li>
            We don&apos;t sell data, run ads, or use tracking cookies. We use
            Plausible for aggregate page analytics.
          </li>
          <li>Email us and we&apos;ll delete everything we hold about you.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="What we collect">
        <p>
          <strong>Account.</strong> Your email address and a password. The
          password is hashed by Supabase Auth; we never see or store it in plain
          text.
        </p>
        <p>
          <strong>Connections.</strong> The API credentials you paste when
          connecting a tool. They are encrypted with AES-256 before they touch
          the database, and the encryption key is stored separately from the
          data. We also store the tool name, any tags you add, and your alert
          threshold settings.
        </p>
        <p>
          <strong>Balance readings.</strong> The numbers your tools report
          (credits remaining, usage) and when we read them. We keep the history
          so we can compute burn rates and tell you when something will run dry.
        </p>
        <p>
          <strong>Alert delivery.</strong> Where you asked to be notified: your
          email address and any webhook URLs you configure, plus a log of the
          alerts we sent.
        </p>
        <p>
          <strong>Usage analytics.</strong> Basic aggregate page analytics from
          Plausible, such as page paths and referrers. We do not send account
          emails, API keys, balance values, or connected-tool data to analytics.
        </p>
      </LegalSection>

      <LegalSection heading="What we never collect">
        <p>
          Your contacts, leads, prospect lists, email content, message bodies,
          campaign data, or anything else inside the tools you connect. We call
          each vendor&apos;s balance or usage endpoint, read the number, and
          leave. QuotaCanary never modifies anything in your accounts and never
          spends your credits.
        </p>
        <p>
          We do not use ad trackers, tracking cookies, or analytics that record
          emails, API keys, balance values, contact lists, message bodies, or
          campaign data.
        </p>
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>
          Your account and connection data has one purpose: monitoring. We poll
          your balances roughly every 15 minutes, compute how fast they are
          draining, and alert you before one runs out. Plausible analytics is
          only used to understand aggregate page traffic and product usage. We
          don&apos;t sell data, share it with advertisers, or use it to train
          anything.
        </p>
      </LegalSection>

      <LegalSection heading="Where it lives">
        <p>
          QuotaCanary runs on a small number of infrastructure providers, each
          processing data on our behalf:
        </p>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            listStyle: "disc",
            display: "grid",
            gap: 8,
          }}
        >
          <li>
            <strong>Supabase</strong> - database and authentication (where your
            account and encrypted credentials are stored).
          </li>
          <li>
            <strong>Railway</strong> - application hosting.
          </li>
          <li>
            <strong>Postmark</strong> - delivers alert and account emails.
          </li>
          <li>
            <strong>Cloudflare</strong> - DNS and traffic proxying.
          </li>
          <li>
            <strong>Plausible</strong> - privacy-friendly aggregate analytics,
            served from plausible.reechee.io.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          We set the cookies required to keep you signed in, and that&apos;s it.
          No ad cookies, no cross-site tracking.
        </p>
      </LegalSection>

      <LegalSection heading="Retention and deletion">
        <p>
          Remove a connection and its credentials and balance history are
          deleted with it. To delete your whole account and everything tied to
          it, email <a href="mailto:hey@quotacanary.com">hey@quotacanary.com</a>{" "}
          and we&apos;ll do it within 30 days, usually much faster. Self-serve
          account deletion is on the roadmap; until then, a human handles it.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          You can ask us what we hold about you, ask for a copy of it, ask us to
          correct it, or ask us to delete it. Same address:{" "}
          <a href="mailto:hey@quotacanary.com">hey@quotacanary.com</a>. If
          you&apos;re covered by GDPR or a similar law, these are your legal
          rights; we honor them for everyone regardless.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Credentials are encrypted at rest (AES-256), all traffic runs over
          HTTPS, and we recommend using read-only or scoped API keys wherever
          your tools support them. If you find a security problem, please email{" "}
          <a href="mailto:hey@quotacanary.com">hey@quotacanary.com</a> before
          posting it anywhere public, and we&apos;ll take it seriously and fix
          it fast.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes in any way that matters, we&apos;ll update the
          date at the top and email you about material changes before they take
          effect.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          <a href="mailto:hey@quotacanary.com">hey@quotacanary.com</a>. A human
          reads it.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
