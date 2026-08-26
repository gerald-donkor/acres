#!/usr/bin/env bash
# Idempotent role/database bootstrap for production Postgres/PostGIS. This
# deliberately does not create the local test database or acres_test role.
set -euo pipefail

: "${ACRES_MIGRATOR_PASSWORD:?ACRES_MIGRATOR_PASSWORD is required}"
: "${ACRES_APP_PASSWORD:?ACRES_APP_PASSWORD is required}"

PSQL_SUPERUSER="${POSTGRES_USER:-postgres}"
PSQL_MAINTENANCE_DB="${POSTGRES_DB:-postgres}"

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname "$PSQL_MAINTENANCE_DB" \
  --set=maintenance_db="$PSQL_MAINTENANCE_DB" \
  --set=migrator_password="$ACRES_MIGRATOR_PASSWORD" \
  --set=app_password="$ACRES_APP_PASSWORD" <<'EOSQL'
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

SELECT 'CREATE DATABASE acres OWNER acres_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'acres')\gexec

REVOKE CONNECT, TEMPORARY ON DATABASE :"maintenance_db" FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE :"maintenance_db" FROM acres_app;
REVOKE CONNECT, TEMPORARY ON DATABASE acres FROM PUBLIC;
GRANT CONNECT ON DATABASE acres TO acres_app;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname acres <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE ON SCHEMA public TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO acres_app;
EOSQL
