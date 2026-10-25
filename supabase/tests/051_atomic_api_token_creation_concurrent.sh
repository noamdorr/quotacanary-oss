#!/usr/bin/env bash
# QUO-67: prove create_api_token holds the cap under a concurrent burst.
#
# A single transaction cannot test this, so this drives real parallel sessions
# against the local stack. Each session opens a transaction, calls the RPC, then
# holds the transaction open for a beat before committing. That delay is what
# makes the result deterministic rather than a timing coin-flip: without the
# per-user advisory lock every session's count would run against a snapshot
# taken before any sibling committed, so all of them would see the same
# under-cap total and all would insert.
#
# Usage: supabase start && supabase/tests/051_atomic_api_token_creation_concurrent.sh
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
USER_ID='00000000-0000-4000-8000-000000000052'
SESSIONS=5
CAP=2 # the user starts with 1 active token, so exactly 1 create may succeed
HOLD=0.5

psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -t -A "$@"; }

cleanup() {
  psql_q -c "delete from auth.users where id = '$USER_ID';" >/dev/null 2>&1 || true
  rm -f /tmp/quo67-session-*.log
}
trap cleanup EXIT

cleanup

psql_q <<SQL
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '$USER_ID', 'authenticated', 'authenticated',
  'atomic-api-token-burst@example.test', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.api_tokens (user_id, name, token_hash, token_hint)
values ('$USER_ID', 'Pre-existing', 'burst-seed-hash', 'seed');
SQL

echo "seeded 1 active token; firing $SESSIONS concurrent creates at a cap of $CAP"

for i in $(seq 1 "$SESSIONS"); do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -t -A >"/tmp/quo67-session-$i.log" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$USER_ID', true);
select coalesce(
  public.create_api_token('burst $i', 'burst-hash-$i', 'b$i', $CAP, '{read}')::text,
  'CAPPED'
);
select pg_sleep($HOLD);
commit;
SQL
done
wait

granted=$(psql_q -c "
  select count(*) from public.api_tokens
  where user_id = '$USER_ID' and revoked_at is null;")

capped=0
for i in $(seq 1 "$SESSIONS"); do
  if grep -q CAPPED "/tmp/quo67-session-$i.log"; then
    capped=$((capped + 1))
  fi
done

echo "active tokens after the burst: $granted (cap $CAP)"
echo "sessions refused with CAPPED: $capped of $SESSIONS"

if [ "$granted" -ne "$CAP" ] || [ "$capped" -ne $((SESSIONS - 1)) ]; then
  echo "FAIL: expected $CAP active tokens and $((SESSIONS - 1)) refusals" >&2
  cat /tmp/quo67-session-*.log >&2
  exit 1
fi

echo "PASS: the cap held under $SESSIONS concurrent creates"
