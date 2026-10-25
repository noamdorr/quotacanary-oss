# Security

## QuotaCanary for Mac

Your vendor API keys live in the Mac’s login Keychain, with synchronization disabled. They never go to QuotaCanary servers. The app makes read-only balance requests directly to each vendor, using that vendor’s key. Local connection files and history do not store plaintext keys.

If you opt in to update checks, the app sends its app version, macOS version and chip to the signed update feed.

The Mac app has no analytics and requires no QuotaCanary account. Checks and alerts work while the app is running and your Mac is awake and online. Local storage is not protection against someone who controls your unlocked Mac.

The same model is published for non-developers at [quotacanary.com/security](https://quotacanary.com/security). Keep the two in step when you change either.

## When you run the web version yourself

The [self-host web app](docs/SELF_HOSTING.md) uses a different storage model. You operate the server, database, credentials and polling schedule. Its API and MCP server serve that instance, not the Mac app’s local connections.

## How keys are stored

- Keys are encrypted with **AES-256-GCM** before they are written to the database. GCM is authenticated encryption: a random 12-byte IV per value and an auth tag that is verified on decrypt, so tampered ciphertext is rejected. See [`src/lib/crypto.ts`](src/lib/crypto.ts).
- The plaintext key is **never stored**. Only `iv:authTag:ciphertext` lands in the `connections.encrypted_key` column.
- The **encryption key lives in your server environment** (`ENCRYPTION_KEY`), separate from the database. A database leak alone cannot decrypt anything; an attacker would also need your environment.
- **Row-level security** restricts every connection row to its owner via `(select auth.uid()) = user_id`. See [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql). One account cannot read another's data, encrypted or not.
- Ciphertext **never reaches the browser**. Keys are decrypted server-side only at poll time, to make a single read-only call to the vendor.
- QuotaCanary makes **read-only** calls. It reads balances; it never modifies your accounts on connected tools.

## The honest limit for self-hosters

Your web server can decrypt vendor keys because it needs them to poll balances. Encryption at rest protects against a database leak alone; it does not prevent an operator or an attacker with both the database and server secrets from decrypting them. Choose infrastructure you trust, restrict access and keep backups and logs free of secrets.

## Limit access

Where a vendor supports it, use a read-only or narrowly scoped API key. The actual access granted depends on the vendor; a balance checker cannot reduce a key’s permissions itself. Some adapters send credentials as URL parameters, so vendor or proxy request logs may contain them even when transport uses HTTPS.

## Reporting a vulnerability

Email **hey@quotacanary.com**. Please do not open a public issue for a security report. We will acknowledge and work a fix with you.
