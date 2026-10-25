-- Every active tool with a Critical default must also have a Low default.
-- 018 and 019 inserted three tools without one after 009's backfill had
-- already run, so on a database built from migrations alone (the hosted one)
-- they never reported Low until 069 (QUO-155). seed.sql repeats 009's
-- backfill, which hides a gap like that on any seeded database, so CI runs
-- this file after `db reset --no-seed` as well as with the rest of this
-- folder. The no-seed run is the one that catches a future tool insert.
do $$
declare
  v_missing text;
begin
  select string_agg(id, ', ' order by id) into v_missing
  from public.tools
  where is_active
    and default_alert_threshold is not null
    and default_low_threshold is null;
  if v_missing is not null then
    raise exception
      'tools with a Critical default and no Low default: %', v_missing;
  end if;
end $$;
