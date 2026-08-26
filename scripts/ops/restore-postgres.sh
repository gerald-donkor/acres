#!/bin/sh
set -eu

if [ $# -lt 1 ]; then
  printf 'usage: %s <backup-file.dump>\n' "$0" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  printf 'restore error: backup file does not exist: %s\n' "$BACKUP_FILE" >&2
  exit 1
fi

if [ ! -r "$BACKUP_FILE" ]; then
  printf 'restore error: backup file is not readable: %s\n' "$BACKUP_FILE" >&2
  exit 1
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-${POSTGRES_USER:-acres_migrator}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-acres}}"

if [ -z "${PGPASSWORD:-}" ]; then
  printf 'restore error: PGPASSWORD environment variable is required\n' >&2
  exit 1
fi

printf 'Checking target PostgreSQL connection on %s:%s...\n' "$PGHOST" "$PGPORT"
pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null 2>&1 || {
  printf 'restore error: PostgreSQL is not ready on %s:%s\n' "$PGHOST" "$PGPORT" >&2
  exit 1
}

printf 'Restoring %s into database "%s" on %s:%s...\n' "$BACKUP_FILE" "$PGDATABASE" "$PGHOST" "$PGPORT"

PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGDATABASE="$PGDATABASE" \
  pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$PGDATABASE" "$BACKUP_FILE"

TABLE_COUNT="$(
  PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGDATABASE="$PGDATABASE" \
    psql -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"

printf 'PostgreSQL restore completed successfully. Verified %s tables in public schema.\n' "$TABLE_COUNT"
