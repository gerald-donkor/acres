#!/usr/bin/env bash
# Post-migration hardening (mirrors scripts/db/harden-runtime-privileges.sh)
# and verification that acres_app cannot bypass forced RLS on Neon, over the
# pooled and direct hosts. Run after neon-bootstrap.sh and
# `prisma migrate deploy`. Expected SQL errors are printed as evidence; the
# exit status is nonzero when any assertion fails.
# Usage: scripts/vercel/neon-verify.sh [secrets-dir]
set -uo pipefail
S="${1:-${ACRES_VERCEL_SECRETS_DIR:-$HOME/.config/acres/vercel-preview}}"
[ -f "$S/neon-urls.env" ] || { echo "missing $S/neon-urls.env (run neon-bootstrap.sh)" >&2; exit 2; }
set -a; . "$S/neon-urls.env"; set +a

# psql with the password moved from the URL into PGPASSWORD.
pq() {
  local url="$1"; shift
  PGPASSWORD="$(sed -E 's#^[^:]+://[^:@/]+:([^@]+)@.*#\1#' <<<"$url")" \
    psql "$(sed -E 's#^([^:]+://[^:@/]+):[^@]+@#\1@#' <<<"$url")" -X "$@"
}
failures=0
expect() { # expect <label> <actual> <wanted>
  if [ "$2" = "$3" ]; then echo "PASS $1 = $2"; else echo "FAIL $1 = $2 (want $3)"; failures=$((failures+1)); fi
}
q() { pq "$1" -A -t -q -c "$2" 2>&1 | tr -d '\r'; }

echo "== harden (as migrator)"
if pq "$DATABASE_MIGRATION_URL" -q -v ON_ERROR_STOP=1 <<'EOSQL'
REVOKE CONNECT, TEMPORARY ON DATABASE acres FROM PUBLIC;
GRANT CONNECT ON DATABASE acres TO acres_app;
REVOKE ALL PRIVILEGES ON TABLE public."_prisma_migrations" FROM acres_app;
REVOKE ALL PRIVILEGES ON TABLE public."_prisma_migrations" FROM acres_test;
EOSQL
then echo "PASS harden"; else echo "FAIL harden"; failures=$((failures+1)); fi

echo "== catalog (as migrator)"
M="$DATABASE_MIGRATION_URL"
TABLES="from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname not in ('_prisma_migrations','spatial_ref_sys')"
expect app_role_super_bypass_createrole "$(q "$M" "select rolsuper||','||rolbypassrls||','||rolcreaterole from pg_roles where rolname='acres_app'")" "false,false,false"
expect app_in_neon_superuser "$(q "$M" "select pg_has_role('acres_app','neon_superuser','member')")" f
expect rls_enabled_not_forced "$(q "$M" "select count(*) $TABLES and relrowsecurity and not relforcerowsecurity")" 0
expect non_rls_tables "$(q "$M" "select string_agg(relname, ',' order by relname) $TABLES and not relrowsecurity")" \
  "Account,AccountToken,ContactSubmission,InsightReport,JobRun,Region,RegionAlias,RegionCode,RegionGeometry,RegionSource,RegionalMetric,Session"
echo "info tables/rls_forced: $(q "$M" "select count(*)||'/'||count(*) filter (where relforcerowsecurity) $TABLES")"
echo "info postgis: $(q "$M" "select extversion from pg_extension where extname='postgis'")"

for path in DATABASE_URL DATABASE_APP_DIRECT_URL; do
  A="${!path}"
  echo "== runtime as acres_app via $path"
  expect "$path whoami" "$(q "$A" "select current_user")" acres_app
  expect "$path no_context_org_rows" "$(q "$A" 'select count(*) from "Organization"')" 0
  expect "$path prisma_migrations_denied" "$(q "$A" 'select count(*) from "_prisma_migrations"' | grep -c 'permission denied')" 1
  expect "$path postgis_call" "$(q "$A" 'select ST_AsText(ST_SetSRID(ST_MakePoint(1,2),4326))')" "POINT(1 2)"
  expect "$path insert_without_context_denied" \
    "$(q "$A" 'begin; insert into "AuditEvent" default values; rollback;' | grep -c 'violates row-level security')" 1
  expect "$path tx_local_ctx_after_commit" \
    "$(pq "$A" -A -t -q <<'EOSQL' 2>&1 | tail -1
begin;
select set_config('acres.organization_id', gen_random_uuid()::text, true) is not null;
commit;
select coalesce(nullif(current_setting('acres.organization_id', true), ''), '<empty>');
EOSQL
)" "<empty>"
done

echo "== pooled context probes"
leak=0
for _ in $(seq 1 20); do
  [ "$(q "$DATABASE_URL" "select coalesce(nullif(current_setting('acres.organization_id', true),''),'<empty>')")" = "<empty>" ] || leak=$((leak+1))
  q "$DATABASE_URL" "begin; select set_config('acres.organization_id', gen_random_uuid()::text, true); commit;" >/dev/null
done
expect pooled_tx_local_leaks "$leak" 0
tmp=$(mktemp -d)
for i in $(seq 1 8); do
  q "$DATABASE_URL" "begin; select set_config('acres.organization_id','00000000-0000-0000-0000-00000000000$i',true); select pg_sleep(0.5); select current_setting('acres.organization_id'); commit;" > "$tmp/$i" &
done
wait
mismatch=0
for i in $(seq 1 8); do grep -q "00000000-0000-0000-0000-00000000000$i" "$tmp/$i" || mismatch=$((mismatch+1)); done
rm -rf "$tmp"
expect pooled_concurrent_mismatches "$mismatch" 0
# Informational: does the pooler reset SESSION-level settings between clients?
# The application must use transaction-local context regardless.
sess_leak=0
for _ in $(seq 1 10); do
  q "$DATABASE_URL" "select set_config('acres.organization_id','11111111-1111-1111-1111-111111111111',false)" >/dev/null
  [ "$(q "$DATABASE_URL" "select coalesce(nullif(current_setting('acres.organization_id', true),''),'<empty>')")" = "<empty>" ] || sess_leak=$((sess_leak+1))
done
echo "info pooled_session_level_leaks: $sess_leak/10 (nonzero means session settings survive across pooled clients)"
# Clear the probe value from whichever pooled server connections hold it.
for _ in $(seq 1 30); do q "$DATABASE_URL" "reset acres.organization_id" >/dev/null; done
residue=0
for _ in $(seq 1 20); do
  [ "$(q "$DATABASE_URL" "select coalesce(nullif(current_setting('acres.organization_id', true),''),'<empty>')")" = "<empty>" ] || residue=$((residue+1))
done
expect pooled_probe_residue_after_reset "$residue" 0

echo "failures=$failures"
[ "$failures" -eq 0 ]
