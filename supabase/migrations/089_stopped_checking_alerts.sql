-- =============================================================================
-- 089_stopped_checking_alerts.sql
-- QUO-289: tell the user when a hosted connection stops checking.
--
-- A failed read used to set status 'error' and alert nobody, so a key that died
-- on the hosted side went silent. The poller now sends one "isn't being
-- checked" alert per failing incident (src/lib/alerts/stopped-checking.ts,
-- dispatch.ts's prepareStoppedChecking) through the existing alert ledger.
--
-- connections.failure_alerted_at is the incident's "alert sent" mark. Like
-- notified_level it is server-owned: record_alert_delivery_result stamps it on
-- the event's first successful channel (with the event's created_at), dispatch.ts stamps it when there is no
-- external channel and clears it on the next good poll read. It stays out of
-- 065's authenticated column grant on purpose (065's test denies any column
-- not on its list, so this one is covered there).
--
-- alert_events.kind tells a stopped-checking event from a balance event. Both
-- can be active at once for one connection (an undelivered critical balance
-- alert does not stop the key from dying), so the one-active-event index from
-- 048 is rebuilt to include it. A stopped-checking event carries level
-- 'critical' so every channel that hears critical balance alerts hears it.
--
-- No catalog or build dependency: safe to apply before or after the deploy,
-- but the deployed code selects failure_alerted_at, so apply it first.
-- =============================================================================

alter table public.connections
  add column if not exists failure_alerted_at timestamptz;

alter table public.alert_events
  add column if not exists kind text not null default 'balance'
    check (kind in ('balance', 'stopped_checking'));

drop index if exists public.idx_alert_events_active_per_connection_level;
create unique index if not exists idx_alert_events_active_per_connection_kind_level
  on public.alert_events (connection_id, kind, level)
  where delivery_satisfied_at is null and delivery_canceled_at is null;

-- Identical to 056's version except for the stopped-checking branch: its
-- first successful delivery stamps the incident instead of advancing the
-- balance marks, and never stamps alert_fired_at (the "Alerted" badge is about
-- balances).
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

      if v_event.kind = 'stopped_checking' then
        -- The event's creation time, not now(): a retry can succeed after a
        -- manual refresh already ended the incident, and a stamp dated later
        -- than that good read would silence the next incident.
        update public.connections
           set failure_alerted_at = v_event.created_at
         where id = v_event.connection_id;
      else
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
        -- low-level success after a critical escalation must not demote a
        -- mark, and a pool the alert never mentioned must stay a candidate.
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
