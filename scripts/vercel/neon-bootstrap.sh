#!/usr/bin/env bash
# Neon preview bootstrap for the Vercel migration (docs/vercel-deployment.md).
# Mirrors scripts/db/bootstrap-production-roles.sh for a provider with no
# superuser: neondb_owner (neon_superuser member, BYPASSRLS) is used only here.
# Idempotent. Reads a `vercel env pull --environment=preview` file and keeps
# generated role passwords and derived URLs beside it (0600). Passwords reach
# psql through the environment only, never argv or output.
# Usage: scripts/vercel/neon-bootstrap.sh [secrets-dir]
set -euo pipefail
umask 077
S="${1:-${ACRES_VERCEL_SECRETS_DIR:-$HOME/.config/acres/vercel-preview}}"
[ -f "$S/preview.env" ] || { echo "missing $S/preview.env (vercel env pull)" >&2; exit 2; }
[ "$(stat -c %a "$S")" = 700 ] || { echo "$S must be mode 0700" >&2; exit 2; }
set -a; . "$S/preview.env"; set +a
[ "${VERCEL_ENV:-}" = preview ] || { echo "refusing: env file is not preview" >&2; exit 2; }
: "${NEON_OWNER_DATABASE_URL_UNPOOLED:?owner URL absent from preview env}"
: "${NEON_OWNER_PGHOST:?pooled host absent}" "${NEON_OWNER_PGHOST_UNPOOLED:?direct host absent}"

# psql with the password moved from the URL into PGPASSWORD.
pq() {
  local url="$1"; shift
  PGPASSWORD="$(sed -E 's#^[^:]+://[^:@/]+:([^@]+)@.*#\1#' <<<"$url")" \
    psql "$(sed -E 's#^([^:]+://[^:@/]+):[^@]+@#\1@#' <<<"$url")" -X -q -v ON_ERROR_STOP=1 "$@"
}

OWNER="$NEON_OWNER_DATABASE_URL_UNPOOLED"
ACRES_OWNER="${OWNER/\/neondb\?//acres?}"
[ "$ACRES_OWNER" != "$OWNER" ] || { echo "owner URL is not .../neondb?...; refusing" >&2; exit 2; }

ROLES="$S/neon-roles.env"
if [ ! -f "$ROLES" ]; then
  {
    echo "ACRES_MIGRATOR_PASSWORD=$(openssl rand -hex 32)"
    echo "ACRES_APP_PASSWORD=$(openssl rand -hex 32)"
  } > "$ROLES"
fi
set -a; . "$ROLES"; set +a

pq "$OWNER" <<'EOSQL'
\getenv migrator_password ACRES_MIGRATOR_PASSWORD
\getenv app_password ACRES_APP_PASSWORD
SELECT format('CREATE ROLE acres_migrator LOGIN PASSWORD %L CREATEDB BYPASSRLS', :'migrator_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_migrator')\gexec
SELECT format('ALTER ROLE acres_migrator LOGIN PASSWORD %L CREATEDB BYPASSRLS', :'migrator_password')\gexec
SELECT format('CREATE ROLE acres_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_app')\gexec
SELECT format('ALTER ROLE acres_app LOGIN PASSWORD %L NOBYPASSRLS', :'app_password')\gexec
-- Migrations grant to acres_test; no test database runs on Neon.
SELECT 'CREATE ROLE acres_test NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_test')\gexec
-- Needed for CREATE DATABASE ... OWNER and ALTER DEFAULT PRIVILEGES FOR ROLE.
GRANT acres_migrator TO neondb_owner;
SELECT 'CREATE DATABASE acres OWNER acres_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'acres')\gexec
REVOKE CONNECT, TEMPORARY ON DATABASE neondb FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE acres FROM PUBLIC;
GRANT CONNECT ON DATABASE acres TO acres_app;
EOSQL

pq "$ACRES_OWNER" <<'EOSQL'
DO $$ BEGIN
  IF current_database() <> 'acres' THEN
    RAISE EXCEPTION 'not connected to acres; refusing';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE ON SCHEMA public TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO acres_app;
EOSQL

# Role URLs (direct for migrator, pooled for runtime), never printed.
{
  echo "DATABASE_MIGRATION_URL=postgresql://acres_migrator:${ACRES_MIGRATOR_PASSWORD}@${NEON_OWNER_PGHOST_UNPOOLED}/acres?sslmode=require"
  echo "DATABASE_URL=postgresql://acres_app:${ACRES_APP_PASSWORD}@${NEON_OWNER_PGHOST}/acres?sslmode=require"
  echo "DATABASE_APP_DIRECT_URL=postgresql://acres_app:${ACRES_APP_PASSWORD}@${NEON_OWNER_PGHOST_UNPOOLED}/acres?sslmode=require"
} > "$S/neon-urls.env"
chmod 600 "$S/neon-urls.env" "$ROLES"
echo "bootstrap ok"
