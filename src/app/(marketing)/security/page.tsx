import { LegalPage, LegalSection } from "@/components/marketing/LegalPage"
import { COPY } from "@/components/marketing/copy"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Security - QuotaCanary",
  description:
    "How QuotaCanary stores your API keys, what it can and cannot do with them, how long it keeps your data, and the one limit hosting can't remove.",
}

export default function SecurityPage() {
  return (
    <LegalPage title="Security" updated="October 11, 2026">
      <p style={{ fontSize: 16, lineHeight: 1.65, margin: 0 }}>
        QuotaCanary stores third-party API keys so it can read your credit
        balances. This page explains exactly how those keys are handled, and is
        honest about what hosting model protects against what. You are about to
        paste something valuable, so you should be able to read this before you
        have an account, not after.
      </p>

      <LegalSection heading="How keys are stored">
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
            Keys are encrypted with <strong>AES-256-GCM</strong> before they are
            written to the database. GCM is authenticated encryption: a random
            12-byte IV per value and an auth tag that is verified on decrypt, so
            tampered ciphertext is rejected.
          </li>
          <li>
            The plaintext key is <strong>never stored</strong>. Only{" "}
            <code>iv:authTag:ciphertext</code> lands in the database, alongside
            the last 4 characters so you can tell connections apart.
          </li>
          <li>
            The <strong>encryption key lives in the server environment</strong>,
            separate from the database. A database leak alone cannot decrypt
            anything; an attacker would also need the environment.
          </li>
          <li>
            Every connection row is restricted to its owner by{" "}
            <strong>row-level security</strong>. One account cannot read
            another&apos;s data, encrypted or not.
          </li>
          <li>
            Ciphertext <strong>never reaches the browser</strong>. Keys are
            decrypted server-side only at poll time, to make a single read-only
            call to the vendor.
          </li>
          <li>
            Replacing a key overwrites the old one in place. We keep no history
            of previous credentials.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="What we do with the key">
        <p>
          QuotaCanary makes <strong>read-only</strong> calls. It reads balances;
          it never modifies your accounts on connected tools, never spends
          credits, and never touches your contacts, leads, messages, or
          campaigns. It is a strictly smaller ask than the tools you already
          trust to act on your behalf.
        </p>
        <p>
          Balances are checked on a schedule, roughly every 15 minutes, plus
          whenever you refresh a connection yourself.
        </p>
      </LegalSection>

      <LegalSection heading="The honest limit">
        <p>
          On the <strong>hosted</strong> app, the server can technically decrypt
          your keys, because it has to use them to poll your balances while you
          are away. This is true of any hosted tool that acts on your behalf.
          Encryption at rest protects against a database leak; it does not mean
          the operator is cryptographically incapable of decryption.
        </p>
        <p>
          If you do not want any operator to be able to decrypt your keys,{" "}
          <a
            href="https://github.com/noamdorr/quotacanary-oss/blob/master/docs/SELF_HOSTING.md"
            style={{ textDecoration: "underline" }}
          >
            self-host
          </a>
          . Then you are the operator, you hold the encryption key, and your
          keys never leave your infrastructure. QuotaCanary is open source and
          the code is identical, so you can read exactly what it does before you
          trust it.
        </p>
      </LegalSection>

      <LegalSection heading={COPY.mac.securityHeading}>
        <p>{COPY.mac.securityParagraph}</p>
      </LegalSection>

      <LegalSection heading="A tip that limits blast radius">
        <p>
          Where a vendor offers it, paste a <strong>read-only or scoped</strong>{" "}
          API key. QuotaCanary only needs to read balances, so a scoped key
          means the worst case is &quot;someone could read your balance,&quot;
          which is close to nothing. Plenty of vendors only issue one
          all-or-nothing key, in which case there is nothing to scope down and
          we will not pretend otherwise.
        </p>
        <p>
          A minor note for the thorough: a few vendor adapters pass the key as a
          URL parameter (<code>?api_key=</code>), because that is the only
          authentication those vendors accept. Over HTTPS that is encrypted in
          transit; the only theoretical exposure is the vendor&apos;s own
          request logs, not QuotaCanary.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep things">
        <p>
          <strong>Credentials</strong> are kept until you delete the connection
          or replace the key.
        </p>
        <p>
          <strong>Balance readings</strong> are pruned after 90 days, except
          that the most recent 50 readings for each watched balance are always
          kept, so a tool you stopped polling still has a history to show you.
        </p>
        <p>
          <strong>Alert history</strong>, tool requests, and feedback you send
          us are kept indefinitely. Alert history records the tool name, the
          name you gave the connection, and the numbers that triggered the
          alert. It never contains your API key.
        </p>
      </LegalSection>

      <LegalSection heading="Deleting things">
        <p>
          <strong>Deleting a connection</strong> deletes its encrypted
          credential and its balance history from the live database immediately.
          Alert history for that connection survives the delete, because it is
          your record of what happened, and it keeps the tool name and
          connection name you chose.
        </p>
        <p>
          <strong>Deleting your account</strong> is not yet self-serve. Email{" "}
          <a
            href="mailto:hey@quotacanary.com"
            style={{ textDecoration: "underline" }}
          >
            hey@quotacanary.com
          </a>{" "}
          and we will delete everything we hold about you within 30 days.
          Self-serve deletion is on the roadmap.
        </p>
        <p>
          One caveat we would rather state than hide: deletion removes rows from
          the live database, but encrypted database backups roll off on their
          own schedule, so a deleted row can persist in a backup for a while
          after it is gone from the app.
        </p>
      </LegalSection>

      <LegalSection heading="Reporting a vulnerability">
        <p>
          Email{" "}
          <a
            href="mailto:hey@quotacanary.com"
            style={{ textDecoration: "underline" }}
          >
            hey@quotacanary.com
          </a>
          . Please do not open a public issue for a security report. We will
          acknowledge it and work a fix with you.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
