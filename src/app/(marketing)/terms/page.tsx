import { LegalPage, LegalSection } from "@/components/marketing/LegalPage"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of service - QuotaCanary",
  description:
    "The terms for using QuotaCanary: a free credit-balance monitoring service.",
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="June 12, 2026">
      <p style={{ fontSize: 16, lineHeight: 1.65, margin: 0 }}>
        QuotaCanary is a free service that monitors the credit balances of tools
        you connect and alerts you before they run out. These terms are short
        because the deal is simple. By creating an account you agree to them.
      </p>

      <LegalSection heading="Your account">
        <p>
          Sign up with an email you control and keep your password to yourself.
          You&apos;re responsible for what happens under your account. One
          account per person is plenty.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Only connect API keys you are authorized to use - yours, or your
          team&apos;s with their blessing. Don&apos;t use QuotaCanary to probe
          accounts that aren&apos;t yours, don&apos;t try to break or overload
          the service, and don&apos;t resell access to it.
        </p>
      </LegalSection>

      <LegalSection heading="Your tools, your vendors">
        <p>
          The tools you connect (email verifiers, enrichment APIs, scrapers, AI
          providers) have their own terms. Your relationship with them is yours;
          make sure connecting a key to a monitoring service is fine under their
          rules. QuotaCanary only reads balance and usage endpoints with the
          credentials you provide and never modifies anything in those accounts.
        </p>
      </LegalSection>

      <LegalSection heading="Alerts are best-effort">
        <p>
          This part matters, so no hedging: do not make QuotaCanary your only
          safeguard against running out of credits. Vendors change their APIs
          without notice, emails get delayed or filtered, webhooks fail,
          software has bugs. We work hard to warn you in time, but we cannot
          guarantee that every alert arrives, arrives early enough, or is
          accurate. You remain responsible for your own balances and whatever
          depends on them.
        </p>
      </LegalSection>

      <LegalSection heading="The service is free">
        <p>
          There is currently no paid plan and nothing in the product costs
          money. If we ever introduce a paid tier, it will be for new, genuinely
          expensive functionality, and you&apos;ll be told well before anything
          changes for you. If we ever shut QuotaCanary down entirely, we&apos;ll
          email every account with reasonable notice so you can make other
          arrangements.
        </p>
      </LegalSection>

      <LegalSection heading="Leaving, and being asked to leave">
        <p>
          You can stop using QuotaCanary at any time and have your data deleted
          (see the <a href="/privacy">privacy policy</a>). We may suspend or
          close accounts that abuse the service, attack it, or violate these
          terms.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          QuotaCanary is provided as-is and as-available, without warranties of
          any kind, express or implied, including fitness for a particular
          purpose. It&apos;s a free monitoring tool, not an insurance policy.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, QuotaCanary and its operator
          are not liable for any indirect, incidental, or consequential damages,
          including lost profits, failed campaigns, or credits that ran out -
          whether or not an alert was sent. Our total liability for any claim is
          limited to the amount you paid us in the past twelve months, which
          today is zero.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          If these terms change materially, we&apos;ll update the date above and
          email you before the changes apply. Continuing to use the service
          after that means you accept them.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms:{" "}
          <a href="mailto:hey@quotacanary.com">hey@quotacanary.com</a>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
