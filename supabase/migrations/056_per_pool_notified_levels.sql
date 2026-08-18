-- =============================================================================
-- 056_per_pool_notified_levels.sql
-- QUO-61: track the alert high-water mark per pool, not per connection.
--
-- Thresholds are already per pool (connections.pool_thresholds, keyed by
-- credit_type), but the "already alerted at this level" mark was a single
-- column on the connection. Once one pool alerted at 'low', any other pool on
-- the same connection crossing its own low threshold was silent until it
-- deteriorated to critical or the whole connection recovered. Multi-pool
-- vendors (Apify, BrightData, DataForSEO, ScrapingBee) are a large share of
-- the catalog, so that is most of the alerts they should have received.
--
-- connections.notified_levels mirrors pool_thresholds: a jsonb map keyed by
-- credit_type, values 'low' / 'critical'. connections.notified_level stays as
-- the rollup (the highest mark in the map) - the dashboard's "Alerted" badge
-- reads it, and record_alert_delivery_result keeps both in step.
--
-- alert_events.credit_types records WHICH pools an event covered, so the
-- delivery path can advance exactly those marks. Without it the event knows
-- only pool labels, which are display strings and not keys.
-- =============================================================================

alter table public.connections
  add column if not exists notified_levels jsonb not null default '{}'::jsonb;

alter table public.alert_events
  add column if not exists credit_types text[];

-- Backfill. Re-alerting the whole user base on deploy is the risk in this
-- change, so seed conservatively: every credit_type the connection could be
-- watching inherits the connection-level mark it was already suppressed by.
-- Over-seeding costs nothing - the next poll re-arms any seeded pool that is
-- actually healthy (dispatch.ts's rearmRecoveredPools) - whereas under-seeding
-- fires a duplicate alert at every seeded pool that is still below threshold.
--
-- Sources for the keys, unioned: the connection's explicit watch list, and
-- every credit_type it has ever reported a balance for (the watch list is null
-- when the user watches everything).
with seeded as (
  select c.id,
         jsonb_object_agg(k.credit_type, to_jsonb(c.notified_level::text)) as levels
    from public.connections c
    cross join lateral (
      select unnest(c.watched_credit_types) as credit_type
      union
      select b.credit_type
        from public.balances b
       where b.connection_id = c.id
    ) k
   where c.notified_level <> 'none'
     and c.notified_levels = '{}'::jsonb
     and k.credit_type is not null
   group by c.id, c.notified_level
)
update public.connections c
   set notified_levels = seeded.levels
  from seeded
 where c.id = seeded.id;

-- Historical events predate credit_types and are all satisfied (048 backfilled
-- delivery_satisfied_at), so nothing reads them for an advance. Left null.

-- Advance the per-pool marks the event actually covered, plus the rollup.
-- Otherwise identical to 049's version: success on the event's first channel
-- stamps delivery_satisfied_at, and a critical success stamps alert_fired_at.
create or replace function public.record_alert_delivery_result(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_error text default null,
  p_next_attempt_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.alert_deliveries;
  v_event public.alert_events;
  v_levels jsonb;
  v_event_rank integer;
  v_credit_type text;
begin
  if p_outcome not in ('succeeded', 'retry', 'paused') then
    raise exception 'Unknown delivery outcome %', p_outcome using errcode = '22004';
  end if;

  select * into v_delivery
    from public.alert_deliveries
   where id = p_delivery_id
     and claim_token = p_claim_token
     and status = 'pending'
     for update;
  if not found then
    return false;
  end if;

  if p_outcome = 'succeeded' then
    update public.alert_deliveries
       set status = 'succeeded',
           succeeded_at = now(),
           attempt_count = attempt_count + 1,
           last_attempt_at = now(),
           last_error = null,
           claim_token = null,
           claimed_until = null,
           updated_at = now()
     where id = p_delivery_id;

    select * into v_event
      from public.alert_events
     where id = v_delivery.event_id
       for update;

    if found
       and v_event.delivery_canceled_at is null
       and v_event.delivery_satisfied_at is null then
      update public.alert_events
         set delivery_satisfied_at = now()
       where id = v_event.id;

      v_event_rank := case v_event.level
                        when 'critical'::public.alert_level then 2
                        when 'low'::public.alert_level then 1
                        else 0
                      end;

      select coalesce(notified_levels, '{}'::jsonb) into v_levels
        from public.connections
       where id = v_event.connection_id
         for update;

      -- Advance only upward, and only the pools this event named: a late
      -- low-level success after a critical escalation must not demote a mark,
      -- and a pool the alert never mentioned must stay a candidate.
      foreach v_credit_type in array coalesce(v_event.credit_types, '{}'::text[])
      loop
        if (case v_levels->>v_credit_type
              when 'critical' then 2
              when 'low' then 1
              else 0
            end) < v_event_rank then
          v_levels := jsonb_set(
            v_levels, array[v_credit_type], to_jsonb(v_event.level::text));
        end if;
      end loop;

      update public.connections
         set notified_levels = v_levels,
             notified_level = (
               select case coalesce(max(case value
                                          when 'critical' then 2
                                          when 'low' then 1
                                          else 0
                                        end), 0)
                        when 2 then 'critical'::public.alert_level
                        when 1 then 'low'::public.alert_level
                        else 'none'::public.alert_level
                      end
                 from jsonb_each_text(v_levels)
             ),
             alert_fired_at = case
               when v_event.level = 'critical'::public.alert_level then now()
               else alert_fired_at
             end
       where id = v_event.connection_id;
    end if;
  elsif p_outcome = 'retry' then
    update public.alert_deliveries
       set status = 'pending',
           attempt_count = attempt_count + 1,
           last_attempt_at = now(),
           last_error = p_error,
           next_attempt_at = coalesce(p_next_attempt_at, now() + interval '15 minutes'),
           claim_token = null,
           claimed_until = null,
           updated_at = now()
     where id = p_delivery_id;
  else
    update public.alert_deliveries
       set status = 'paused',
           attempt_count = attempt_count + 1,
           last_attempt_at = now(),
           last_error = p_error,
           claim_token = null,
           claimed_until = null,
           updated_at = now()
     where id = p_delivery_id;
  end if;

  return true;
end;
$$;

-- Unchanged from 048: reachable only through the service-role poll path.
-- CREATE OR REPLACE keeps the existing ACL, but fresh installs have no
-- platform default privileges (see 038/039), so state it explicitly.
revoke all on function public.record_alert_delivery_result(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_alert_delivery_result(uuid, uuid, text, text, timestamptz)
  to service_role;
