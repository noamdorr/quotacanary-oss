#!/usr/bin/env bash
# Prove exactly one real transaction wins an overlapping claim burst.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
# This probe manipulates the singleton lease, so never point it at production.
case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*) ;;
  *) echo 'Refusing non-local lease probe' >&2; exit 1 ;;
esac
scratch=$(mktemp -d)
psql_q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt "$@"; }
cleanup() {
  psql_q -c "delete from public.poll_run_lease where owner_id::text like '00000000-0000-4000-8000-00000000310%';" >/dev/null 2>&1 || true
  rm -r "$scratch"
}
if [ "$(psql_q -c 'select count(*) from public.poll_run_lease')" != 0 ]; then
  echo 'Existing lease found; refusing to interfere' >&2
  rm -r "$scratch"
  exit 1
fi
trap cleanup EXIT
pids=()
for i in 1 2 3 4 5; do
  psql_q >"$scratch/$i" <<SQL &
begin;
set local role service_role;
select case when public.claim_poll_run('00000000-0000-4000-8000-00000000310$i') then 'CLAIMED' else 'HELD' end;
select pg_sleep(0.5);
commit;
SQL
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
if [ "$failed" != 0 ]; then cat "$scratch"/* >&2; exit 1; fi
claimed=$(grep -l '^CLAIMED$' "$scratch"/* | wc -l | tr -d ' ')
held=$(grep -l '^HELD$' "$scratch"/* | wc -l | tr -d ' ')
if [ "$claimed" != 1 ] || [ "$held" != 4 ]; then
  cat "$scratch"/* >&2
  echo "FAIL: $claimed claims and $held held" >&2
  exit 1
fi
echo 'PASS: exactly one claim, four overlap skips across five concurrent transactions'
