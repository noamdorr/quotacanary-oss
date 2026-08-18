-- =============================================================================
-- 055_webhook_signing_secrets.sql
-- QUO-9: give every generic webhook destination its own HMAC signing secret.
-- =============================================================================
--
-- Generic webhook receivers had no way to tell a QuotaCanary delivery from a
-- forged POST: the endpoint URL was the only secret, so anyone who learned it
-- could impersonate us, and a captured delivery could be replayed forever.
-- Deliveries now carry a `quotacanary-signature: t=...,v1=...` header over
-- HMAC-SHA256 of "<t>.<raw body>" (src/lib/alerts/signing.ts).
--
-- Storage mirrors `encrypted_url`: AES-256-GCM at rest via lib/crypto.ts, key
-- in ENCRYPTION_KEY and never beside the ciphertext. Reversible rather than
-- hashed (unlike api_tokens.token_hash) because the sender has to recompute the
-- HMAC on every delivery, which needs the secret itself.
--
-- Both columns are nullable and default null, which is deliberate:
--
--   * Encryption happens in the app, not in SQL, so existing rows cannot be
--     backfilled here.
--   * A null secret sends exactly what shipped before this migration - an
--     unsigned delivery - so a destination created before today keeps working
--     untouched until its owner generates a secret in Settings.
--
-- Slack destinations get no secret. Slack incoming webhooks have no signature
-- verification to point one at, the same reason they are skipped for
-- `idempotency-key`.
--
-- No grant changes. `authenticated` already holds UPDATE on this table (036;
-- 052 column-scoped only `users` and `api_tokens`), and both new columns are
-- written from the owner's own session through the alert-destination server
-- actions, scoped by the existing "alert_destinations: update own" policy.
-- =============================================================================

alter table public.alert_destinations
  add column if not exists encrypted_signing_secret text,
  add column if not exists signing_secret_set_at timestamptz;

-- The settings page must render "signed" vs "not signed" without ever selecting
-- the ciphertext, and PostgREST cannot compute an expression - so the timestamp
-- carries that signal, and the two columns move together or not at all.
alter table public.alert_destinations
  drop constraint if exists alert_destinations_signing_secret_paired;

alter table public.alert_destinations
  add constraint alert_destinations_signing_secret_paired
  check (
    (encrypted_signing_secret is null) = (signing_secret_set_at is null)
  );
