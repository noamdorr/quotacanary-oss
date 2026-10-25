-- 069_tool_low_default_backfill.sql
-- Every tool with a Critical default gets a Low default at 3x, the rule 009
-- set. 009's backfill ran before 018 and 019 added mailercheck, emailhippo
-- and tomba with a Critical default only, so on a database built from
-- migrations alone those three never reported Low or sent a Low alert
-- (QUO-155). seed.sql repeats the backfill, which is why a seeded stack never
-- showed it.
--
-- Idempotent: it only fills nulls, so it is a no-op wherever the pair is
-- already complete, and it never touches a Low default someone set by hand.
update public.tools
  set default_low_threshold = default_alert_threshold * 3
  where default_alert_threshold is not null
    and default_low_threshold is null;
