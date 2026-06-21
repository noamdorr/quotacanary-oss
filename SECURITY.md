# Security

QuotaCanary stores third-party API keys so it can read your credit balances. This document explains exactly how those keys are handled, and is honest about what hosting model protects against what.

## How keys are stored

- Keys are encrypted with **AES-256-GCM** before they are written to the database. GCM is authenticated encryption: a random 12-byte IV per value and an auth tag that is verified on decrypt, so tampered ciphertext is rejected. See [`src/lib/crypto.ts`](src/lib/crypto.ts).
- The plaintext key is **never stored**. Only `iv:authTag:ciphertext` lands in the `connections.encrypted_key` column.
- The **encryption key lives in your server environment** (`ENCRYPTION_KEY`), separate from the database. A database leak alone cannot decrypt anything; an attacker would also need your environment.
- **Row-level security** restricts every connection row to its owner via `(select auth.uid()) = user_id`. See [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql). One account cannot read another's data, encrypted or not.
- Ciphertext **never reaches the browser**. Keys are decrypted server-side only at poll time, to make a single read-only call to the vendor.
- QuotaCanary makes **read-only** calls. It reads balances; it never modifies your accounts on connected tools.

## The honest limit

On the **hosted** app, the server can technically decrypt your keys, because it has to use them to poll your balances while you are away. This is true of any hosted tool that acts on your behalf. Encryption-at-rest protects against a database leak; it does not mean the operator is cryptographically incapable of decryption.

If you do not want any operator to be able to decrypt your keys, **self-host** (see [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)). Then you are the operator, you hold the `ENCRYPTION_KEY`, and your keys never leave your infrastructure. The code is identical, so you can read exactly what it does.

## A tip that limits blast radius

Where a vendor offers it, paste a **read-only or scoped** API key. QuotaCanary only needs to read balances, so a scoped key means the worst case is "someone could read your balance," which is close to nothing.

A minor note for the thorough: a few vendor adapters pass the key as a `?api_key=` URL parameter. Over HTTPS that is encrypted in transit; the only theoretical exposure is the vendor's own request logs, not QuotaCanary.

## Reporting a vulnerability

Email **hey@quotacanary.com**. Please do not open a public issue for a security report. We will acknowledge and work a fix with you.
