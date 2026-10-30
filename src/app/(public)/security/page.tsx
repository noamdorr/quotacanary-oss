import { LegalPage, LegalSection } from "@/components/public/LegalPage"
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
        You operate the server, database, credentials and polling schedule. Its
        API and MCP server serve that instance, not the Mac app’s local
        connections.
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

      <LegalSection heading="The honest limit for self-hosters">
        <p>
          Your web server can decrypt vendor keys because it needs them to poll
          balances. Encryption at rest protects against a database leak alone;
          it does not prevent an operator or an attacker with both the database
          and server secrets from decrypting them. Choose infrastructure you
          trust, restrict access and keep backups and logs free of secrets.
        </p>
      </LegalSection>

      <LegalSection heading="Limit access">
        <p>
          Where a vendor supports it, use a read-only or narrowly scoped API
          key. The actual access granted depends on the vendor; a balance
          checker cannot reduce a key’s permissions itself. Some adapters send
          credentials as URL parameters, so vendor or proxy request logs may
          contain them even when transport uses HTTPS.
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
