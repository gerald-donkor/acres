#!/usr/bin/env bash
# Idempotent role/database bootstrap for local Postgres/PostGIS. Safe to re-run
# — creations guard on existence, and grants/revokes are repeatable.
# See docs/backend.md.
#
# Required env: ACRES_MIGRATOR_PASSWORD, ACRES_APP_PASSWORD, ACRES_TEST_PASSWORD
# Connects as a superuser via psql's normal PG* variables (PGHOST, PGPORT,
# PGPASSWORD, ...) or, for docker-entrypoint-initdb.d, the local trust socket
# the postgres image already sets up. POSTGRES_USER/POSTGRES_DB name that
# superuser and its bootstrap database; both fall back to "postgres".
set -euo pipefail

: "${ACRES_MIGRATOR_PASSWORD:?ACRES_MIGRATOR_PASSWORD is required}"
: "${ACRES_APP_PASSWORD:?ACRES_APP_PASSWORD is required}"
: "${ACRES_TEST_PASSWORD:?ACRES_TEST_PASSWORD is required}"

PSQL_SUPERUSER="${POSTGRES_USER:-postgres}"
PSQL_MAINTENANCE_DB="${POSTGRES_DB:-postgres}"

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname "$PSQL_MAINTENANCE_DB" \
  --set=maintenance_db="$PSQL_MAINTENANCE_DB" \
  --set=migrator_password="$ACRES_MIGRATOR_PASSWORD" \
  --set=app_password="$ACRES_APP_PASSWORD" \
  --set=test_password="$ACRES_TEST_PASSWORD" <<'EOSQL'
SELECT format(
  'CREATE ROLE acres_migrator LOGIN PASSWORD %L CREATEDB',
  :'migrator_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_migrator')\gexec

SELECT format(
  'CREATE ROLE acres_app LOGIN PASSWORD %L',
  :'app_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_app')\gexec

SELECT format(
  'CREATE ROLE acres_test LOGIN PASSWORD %L',
  :'test_password'
)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_test')\gexec

SELECT 'CREATE DATABASE acres OWNER acres_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'acres')\gexec

SELECT 'CREATE DATABASE acres_test OWNER acres_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'acres_test')\gexec

REVOKE CONNECT, TEMPORARY ON DATABASE :"maintenance_db" FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE :"maintenance_db" FROM acres_app;
REVOKE CONNECT, TEMPORARY ON DATABASE :"maintenance_db" FROM acres_test;
REVOKE CONNECT, TEMPORARY ON DATABASE acres FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE acres_test FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE acres FROM acres_test;
REVOKE CONNECT, TEMPORARY ON DATABASE acres_test FROM acres_app;
GRANT CONNECT ON DATABASE acres TO acres_app;
GRANT CONNECT ON DATABASE acres_test TO acres_test;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname acres <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE ON SCHEMA public TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO acres_app;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname acres_test <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE ON SCHEMA public TO acres_test;
-- TRUNCATE (not just DML) so the test suite can reset tables between cases
-- without DELETE-and-hope-the-sequence-resets; acres_app never gets it.
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO acres_test;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO acres_test;
EOSQL
