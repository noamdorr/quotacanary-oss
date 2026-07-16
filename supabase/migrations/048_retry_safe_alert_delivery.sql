-- =============================================================================
-- 048_retry_safe_alert_delivery.sql
-- QUO-5: advance alert high-water marks only after retryable delivery.
--
-- Adds a durable per-channel delivery ledger (alert_deliveries) plus delivery
-- lifecycle fields on alert_events, and two service-role-only functions that
-- claim due deliveries under a lease and record results atomically. The
-- connection-level high-water mark (connections.notified_level) now advances
-- inside record_alert_delivery_result on the event's first successful external
-- delivery, so a transient email/webhook failure can no longer permanently
-- suppress an alert.
-- =============================================================================

-- Delivery lifecycle on the in-app event.
alter table public.alert_events
  add column if not exists delivery_satisfied_at timestamptz,
  add column if not exists delivery_canceled_at timestamptz;

-- Backfill: events created before this migration were delivered under the old
-- advance-on-create model, so treat them as satisfied. Required before the
-- active-event unique index below can build on historical data.
update public.alert_events
   set delivery_satisfied_at = created_at
 where delivery_satisfied_at is null
   and delivery_canceled_at is null;

-- One active (unsatisfied, uncanceled) event per connection and level: a poll
-- retry reuses the existing in-app event instead of duplicating inbox entries.
create unique index if not exists idx_alert_events_active_per_connection_level
  on public.alert_events (connection_id, level)
  where delivery_satisfied_at is null and delivery_canceled_at is null;

-- One row per event and logical delivery target. Full email addresses and
-- webhook URLs are NOT copied here: email resolves from public.users.email and
-- webhook targets from public.alert_destinations.encrypted_url at send time.
-- target_updated_at records the source-row version used for the attempt.
create table if not exists public.alert_deliveries (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.alert_events(id) on delete cascade,
  delivery_key      text not null,
  channel           text not null
                    check (channel in ('email', 'webhook', 'slack_webhook')),
  destination_id    uuid references public.alert_destinations(id) on delete set null,
  status            text not null default 'pending'
                    check (status in ('pending', 'succeeded', 'paused', 'canceled')),
  attempt_count     integer not null default 0,
  next_attempt_at   timestamptz not null default now(),
  last_attempt_at   timestamptz,
  last_error        text,
  succeeded_at      timestamptz,
  target_updated_at timestamptz not null,
  claimed_until     timestamptz,
  claim_token       uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Application-side idempotency boundary: rerunning event preparation fills
  -- missing rows but cannot create a second logical delivery for the same
  -- event and channel.
  unique (event_id, delivery_key)
);

-- RLS on, no user policies: delivery orchestration is service-role only. There
-- is no user-facing delivery-history surface in this iteration.
alter table public.alert_deliveries enable row level security;

create index if not exists idx_alert_deliveries_due
  on public.alert_deliveries (status, next_attempt_at);

create index if not exists idx_alert_deliveries_destination
  on public.alert_deliveries (destination_id)
  where destination_id is not null;

-- Atomically claim due deliveries under a five-minute lease so overlapping
-- poll runs cannot intentionally process the same delivery concurrently.
-- A paused row becomes eligible again when its target's source row (user email
-- mirror or alert destination) is newer than the version last attempted.
create or replace function public.claim_due_alert_deliveries(batch_size integer)
returns setof public.alert_deliveries
language sql
security definer
set search_path = ''
as $$
  with due as (
    select d.id,
           case when d.channel = 'email' then u.updated_at
                else dest.updated_at end as source_updated_at
      from public.alert_deliveries d
      join public.alert_events e on e.id = d.event_id
      left join public.users u on u.id = e.user_id
      left join public.alert_destinations dest on dest.id = d.destination_id
     where (d.claimed_until is null or d.claimed_until < now())
       and (
         (d.status = 'pending'
           and d.next_attempt_at <= now()
           and (d.channel = 'email'
             or (dest.id is not null and dest.is_enabled)))
         or
         (d.status = 'paused'
           and (
             (d.channel = 'email' and u.updated_at > d.target_updated_at)
             or (d.channel <> 'email'
               and dest.id is not null
               and dest.is_enabled
               and dest.updated_at > d.target_updated_at)
           ))
       )
     order by d.next_attempt_at
     limit batch_size
     for update of d skip locked
  )
  update public.alert_deliveries d
     set status = 'pending',
         claim_token = gen_random_uuid(),
         claimed_until = now() + interval '5 minutes',
         target_updated_at = coalesce(due.source_updated_at, d.target_updated_at),
         updated_at = now()
    from due
   where d.id = due.id
  returning d.*;
$$;

-- Record one delivery result atomically behind the claim token. Success on the
-- event's first successful channel stamps delivery_satisfied_at and advances
-- the connection high-water mark; critical success also stamps alert_fired_at.
-- A canceled or superseded delivery/event cannot advance connection state even
-- if an already-running request finishes afterward (the status = 'pending' and
-- claim-token checks reject the late result).
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

      -- Advance only upward: a late low-level success after a critical
      -- escalation must not demote the high-water mark.
      update public.connections
         set notified_level = v_event.level,
             alert_fired_at = case
               when v_event.level = 'critical'::public.alert_level then now()
               else alert_fired_at
             end
       where id = v_event.connection_id
         and (case notified_level
                when 'critical'::public.alert_level then 2
                when 'low'::public.alert_level then 1
                else 0
              end)
           < (case v_event.level
                when 'critical'::public.alert_level then 2
                when 'low'::public.alert_level then 1
                else 0
              end);
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

-- Both functions are reachable only through the service-role poll path.
revoke all on function public.claim_due_alert_deliveries(integer)
  from public, anon, authenticated;
revoke all on function public.record_alert_delivery_result(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_due_alert_deliveries(integer)
  to service_role;
grant execute on function public.record_alert_delivery_result(uuid, uuid, text, text, timestamptz)
  to service_role;
