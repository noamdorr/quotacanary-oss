-- 101_retire_x.sql
-- QUO-451: X leaves the catalog until its usage read is proven free. The check
-- reads GET api.x.com/2/usage/tweets about every 15 minutes, and X's docs say
-- successful responses are billed without saying whether this route is. A
-- balance check must not cost money.
--
-- connections.tool_id references tools(id) with no cascade, and a self-host
-- instance may hold an X connection, so a plain delete could fail or take the
-- connection with it. Two steps instead:
--   1. delete the row when no connection references it (the case on every
--      fresh instance and on any instance that never connected X), so it
--      leaves the table entirely;
--   2. otherwise retire it as 072 did for proxycurl: is_active = false keeps
--      the row and the connection intact and drops it from the directory and
--      the connect picker.
-- Idempotent: re-running it changes nothing. Adding X back is a revert of this
-- change plus a new migration that inserts the row again.
delete from public.tools t
  where t.id = 'x'
    and not exists (select 1 from public.connections c where c.tool_id = t.id);

update public.tools
  set is_active = false
  where id = 'x';
