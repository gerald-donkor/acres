#!/usr/bin/env bash
# Post-migration privilege hardening. Run as acres_migrator after Prisma
# migrations so runtime/test roles cannot mutate Prisma bookkeeping.
set -euo pipefail

PSQL_MIGRATOR="${POSTGRES_MIGRATOR_USER:-acres_migrator}"

harden_database() {
  local database="$1"
  local allowed_role="$2"
  local denied_role="$3"

  psql -v ON_ERROR_STOP=1 --username "$PSQL_MIGRATOR" --dbname "$database" \
    --set=database="$database" \
    --set=allowed_role="$allowed_role" \
    --set=denied_role="$denied_role" <<'EOSQL'
REVOKE CONNECT, TEMPORARY ON DATABASE :"database" FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE :"database" FROM :"denied_role";
GRANT CONNECT ON DATABASE :"database" TO :"allowed_role";

DO $$
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE public."_prisma_migrations" FROM acres_app;
    REVOKE ALL PRIVILEGES ON TABLE public."_prisma_migrations" FROM acres_test;
  END IF;
END
$$;
EOSQL
}

harden_database acres acres_app acres_test
harden_database acres_test acres_test acres_app
