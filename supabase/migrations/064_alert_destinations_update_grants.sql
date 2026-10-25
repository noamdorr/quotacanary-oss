-- QUO-82: narrow authenticated UPDATE on alert_destinations.
-- RLS protects rows, not columns. Revoke 036's blanket UPDATE before granting
-- the fields used by the three user-scoped paths in src/lib/actions/alerts.ts:
--   toggleAlertDestination: is_enabled, updated_at
--   rotateAlertDestinationSecret: encrypted_signing_secret,
--     signing_secret_set_at, updated_at
--   sendTestAlertDestination: last_attempt_at, last_sent_at, last_error
--
-- consecutive_failures belongs to the service-role poller. Identity, creation,
-- URL, kind, name, and minimum level have no authenticated UPDATE path.
-- Existing RLS policies, INSERT/DELETE privileges, anon and service_role grants
-- stay unchanged. This does not move any action behind a SECURITY DEFINER RPC.
begin;

revoke update on public.alert_destinations from authenticated;

grant update (
  is_enabled,
  updated_at,
  encrypted_signing_secret,
  signing_secret_set_at,
  last_attempt_at,
  last_sent_at,
  last_error
) on public.alert_destinations to authenticated;

commit;
