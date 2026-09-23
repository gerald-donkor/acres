#!/usr/bin/env bash
# Run as the PostgreSQL admin on fresh or already initialized production data.
# The monitor password arrives through the operator's one-time admin channel.
set -euo pipefail
set +x

: "${ACRES_MONITOR_BOOTSTRAP_PASSWORD:?inject monitor password through the admin channel}"
case "$ACRES_MONITOR_BOOTSTRAP_PASSWORD" in
  *$'\n'*|*$'\r'*) echo 'monitor password must be a single line' >&2; exit 1 ;;
esac

quoted_password="'$(printf '%s' "$ACRES_MONITOR_BOOTSTRAP_PASSWORD" | sed "s/'/''/g")'"
unset ACRES_MONITOR_BOOTSTRAP_PASSWORD

{
  printf 'SET log_statement = none; SET log_min_error_statement = panic;\n'
  printf "SELECT format('CREATE ROLE acres_monitor LOGIN PASSWORD %%L', %s) WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_monitor')\\gexec\n" "$quoted_password"
  printf 'ALTER ROLE acres_monitor WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %s;\n' "$quoted_password"
  cat <<'SQL'
ALTER ROLE acres_monitor SET search_path = pg_catalog;
GRANT pg_monitor TO acres_monitor;
REVOKE ALL ON DATABASE postgres FROM acres_monitor;
REVOKE ALL ON DATABASE acres FROM acres_monitor;
GRANT CONNECT ON DATABASE acres TO acres_monitor;
SQL
} | psql -X -q -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-postgres}" >/dev/null
unset quoted_password

psql -X -q -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname acres <<'SQL'
REVOKE ALL ON SCHEMA public FROM acres_monitor;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles r
    WHERE r.rolname = 'acres_monitor' AND r.rolcanlogin
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
  ) OR NOT pg_has_role('acres_monitor', 'pg_monitor', 'member')
    OR NOT has_database_privilege('acres_monitor', 'acres', 'CONNECT')
    OR has_database_privilege('acres_monitor', 'acres', 'CREATE')
    OR has_database_privilege('acres_monitor', 'acres', 'TEMPORARY')
    OR has_schema_privilege('acres_monitor', 'public', 'CREATE')
    OR EXISTS (
      SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
      WHERE m.member = 'acres_monitor'::regrole AND r.rolname <> 'pg_monitor'
    ) OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relowner = 'acres_migrator'::regrole
        AND CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f')
          THEN has_table_privilege('acres_monitor', c.oid,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          ELSE false END
    ) OR EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relowner = 'acres_migrator'::regrole
        AND CASE WHEN c.relkind = 'S'
          THEN has_sequence_privilege('acres_monitor', c.oid, 'USAGE, SELECT, UPDATE')
          ELSE false END
    ) THEN
    RAISE EXCEPTION 'acres_monitor privilege verification failed';
  END IF;
END $$;
SQL
echo 'monitor role reconciliation passed'
