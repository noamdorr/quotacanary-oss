-- QUO-289: live proof of 089. A stopped-checking event can be active beside a
-- balance event at the same level, but not beside another of its own kind; its
-- first successful delivery stamps the incident on the connection and leaves
-- the balance marks alone; a balance event still advances them as before.
-- Everything rolls back.
begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000289',
  'authenticated',
  'authenticated',
  'stopped-checking-test@example.test',
  '',
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

insert into public.connections (id, user_id, tool_id, connection_type, name, encrypted_key)
values (
  '00000000-0000-4000-8000-000000001289',
  '00000000-0000-4000-8000-000000000289',
  'hunter', 'api', 'Hunter main', 'fixture-key'
);

do $$
declare
  v_user uuid := '00000000-0000-4000-8000-000000000289';
  v_conn uuid := '00000000-0000-4000-8000-000000001289';
  v_stopped uuid;
  v_balance uuid;
  v_token uuid := gen_random_uuid();
  v_delivery uuid;
  v_conn_row public.connections;
begin
  if (select failure_alerted_at from public.connections where id = v_conn) is not null then
    raise exception 'a new connection already carries an incident stamp';
  end if;

  -- An undelivered critical balance alert and a stopped-checking alert are
  -- different news; the old (connection, level) index refused the second.
  insert into public.alert_events (
    user_id, connection_id, kind, level, tool_name, connection_name, title,
    body, dashboard_url, credit_types
  ) values (
    v_user, v_conn, 'balance', 'critical', 'Hunter', 'Hunter main',
    'Hunter is critically low', 'Hunter main crossed critical threshold.',
    'https://app.example.test/dashboard', array['credits']
  ) returning id into v_balance;

  insert into public.alert_events (
    user_id, connection_id, kind, level, tool_name, connection_name, title,
    body, dashboard_url
  ) values (
    v_user, v_conn, 'stopped_checking', 'critical', 'Hunter', 'Hunter main',
    'Hunter isn''t being checked', 'Hunter rejected the saved key.',
    'https://app.example.test/dashboard'
  ) returning id into v_stopped;

  if (select kind from public.alert_events where id = v_balance) <> 'balance' then
    raise exception 'kind did not default to balance';
  end if;

  -- One active event per (connection, kind, level) still holds.
  begin
    insert into public.alert_events (
      user_id, connection_id, kind, level, tool_name, connection_name, title,
      body, dashboard_url
    ) values (
      v_user, v_conn, 'stopped_checking', 'critical', 'Hunter', 'Hunter main',
      'dup', 'dup', 'https://app.example.test/dashboard'
    );
    raise exception 'a second active stopped-checking event was accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.alert_events (
      user_id, connection_id, kind, level, tool_name, connection_name, title,
      body, dashboard_url
    ) values (
      v_user, v_conn, 'bogus', 'low', 'Hunter', 'Hunter main', 't', 'b',
      'https://app.example.test/dashboard'
    );
    raise exception 'an unknown event kind was accepted';
  exception when check_violation then null;
  end;

  -- Deliver the stopped-checking event. Claimed by hand so the test does not
  -- depend on whatever else is due.
  insert into public.alert_deliveries (
    event_id, delivery_key, channel, status, target_updated_at, claim_token,
    claimed_until
  ) values (
    v_stopped, 'email', 'email', 'pending', now(), v_token,
    now() + interval '5 minutes'
  ) returning id into v_delivery;

  if not public.record_alert_delivery_result(v_delivery, v_token, 'succeeded') then
    raise exception 'recording the stopped-checking delivery was rejected';
  end if;

  select * into v_conn_row from public.connections where id = v_conn;
  if v_conn_row.failure_alerted_at is null then
    raise exception 'a delivered stopped-checking alert did not stamp the incident';
  end if;
  if v_conn_row.notified_level <> 'none'
     or v_conn_row.notified_levels <> '{}'::jsonb
     or v_conn_row.alert_fired_at is not null then
    raise exception 'a stopped-checking delivery moved the balance marks';
  end if;
  if (select delivery_satisfied_at from public.alert_events where id = v_stopped) is null then
    raise exception 'the stopped-checking event was not satisfied';
  end if;

  -- The balance path is unchanged: its delivery advances the named pool.
  v_token := gen_random_uuid();
  update public.connections set failure_alerted_at = null where id = v_conn;
  insert into public.alert_deliveries (
    event_id, delivery_key, channel, status, target_updated_at, claim_token,
    claimed_until
  ) values (
    v_balance, 'email', 'email', 'pending', now(), v_token,
    now() + interval '5 minutes'
  ) returning id into v_delivery;

  if not public.record_alert_delivery_result(v_delivery, v_token, 'succeeded') then
    raise exception 'recording the balance delivery was rejected';
  end if;

  select * into v_conn_row from public.connections where id = v_conn;
  if v_conn_row.notified_levels <> '{"credits": "critical"}'::jsonb
     or v_conn_row.notified_level <> 'critical'
     or v_conn_row.alert_fired_at is null then
    raise exception 'a balance delivery no longer advances its marks: %',
      v_conn_row.notified_levels;
  end if;
  if v_conn_row.failure_alerted_at is not null then
    raise exception 'a balance delivery stamped the stopped-checking incident';
  end if;
end;
$$;

rollback;
