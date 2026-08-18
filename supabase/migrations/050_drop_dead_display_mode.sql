-- =============================================================================
-- 050_drop_dead_display_mode.sql
-- Drop the orphaned users.display_mode column.
--
-- 002 added display_mode ('flat' | 'grouped') as the dashboard default. It was
-- superseded by view_mode, which is the column the dashboard actually reads and
-- settings actually writes; display_mode has been referenced by no application
-- code since. The auth trigger in 001 inserts into public.users without naming
-- it, so nothing depends on it. Dropping the column also drops its dependent
-- check constraint (users_display_mode_check).
-- =============================================================================

alter table public.users
  drop column if exists display_mode;
