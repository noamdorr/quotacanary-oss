-- 072_retire_proxycurl.sql
-- QUO-233: Proxycurl has shut down (its site reads "no longer in service";
-- Enrich Layer is the successor and onboards as its own tool). Retire the row
-- rather than delete or rename it: `connections.tool_id` and the balance
-- history reference the id, so the row stays and only leaves the directory,
-- the connect picker and the catalog. catalog/tools.json drops the entry in
-- the same change, and seed.sql mirrors the flag.
--
-- Idempotent: re-running it leaves the row inactive.
update public.tools
  set is_active = false
  where id = 'proxycurl';
