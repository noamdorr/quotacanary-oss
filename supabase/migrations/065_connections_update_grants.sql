-- QUO-80: RLS protects rows; these grants restrict authenticated UPDATE columns.
-- Deploy the compatible updateKey server action BEFORE applying this migration:
-- the previous action writes encrypted_key/key_hint as authenticated.
-- This migration has no catalog/build dependency. Fresh installs apply it normally.
--
-- User actions in src/lib/actions/connections.ts:
--   renameConnection: name, updated_at
--   setAlert: alert_enabled, updated_at
--   setThresholds: low_threshold, alert_threshold, updated_at
--   setPoolThresholds: pool_thresholds, updated_at
-- Shared src/lib/refresh-connection.ts, also used by authenticated manual refresh:
--   status, last_error, consecutive_failures, updated_at (success and failure).
--
-- updateKey now writes encrypted_key/key_hint via the server-only admin client,
-- AFTER user authentication, ownership lookup, adapter validation and encryption.
-- A user-callable ciphertext RPC would just recreate the direct UPDATE bypass.
-- Alert marks are owned by src/lib/alerts/dispatch.ts and the service-role
-- record_alert_delivery_result RPC. Identity and creation fields are immutable.
-- INSERT/DELETE, RLS, anon and service_role grants are unchanged.
begin;

revoke update on public.connections from authenticated;

grant update (
  name,
  updated_at,
  alert_enabled,
  low_threshold,
  alert_threshold,
  pool_thresholds,
  status,
  last_error,
  consecutive_failures
) on public.connections to authenticated;

commit;
