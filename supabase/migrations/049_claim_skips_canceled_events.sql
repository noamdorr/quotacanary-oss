-- =============================================================================
-- 049_claim_skips_canceled_events.sql
-- A delivery under a canceled event is never due.
--
-- 048's claim joins alert_events but reads nothing from it, so a pending
-- delivery row whose event was canceled is still claimed and still sent. Both
-- cancellation paths in dispatch.ts (recovery, and a critical escalation
-- superseding its low event) cancel the delivery rows and then close the
-- event as two separate writes: if the first fails, or the process dies
-- between them, the rows are stranded under a canceled event where nothing
-- re-arms them, and the stale "running low" alert fires against a balance that
-- already recovered.
--
-- The application-side fix is discipline in every current and future caller.
-- This is the invariant, enforced where it cannot be bypassed: whatever left
-- the row pending, a canceled event's delivery is not due.
--
-- delivery_satisfied_at is deliberately NOT checked: an event is satisfied by
-- its FIRST successful channel, while its other channels stay pending and must
-- still retry.
-- =============================================================================

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
     where e.delivery_canceled_at is null
       and (d.claimed_until is null or d.claimed_until < now())
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

-- Unchanged from 048: reachable only through the service-role poll path.
-- CREATE OR REPLACE keeps the existing ACL, but fresh installs have no
-- platform default privileges (see 038/039), so state it explicitly.
revoke all on function public.claim_due_alert_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_alert_deliveries(integer)
  to service_role;
