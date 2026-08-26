#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BACKUP_FILE="${BACKUP_DIR}/acres-db-${TIMESTAMP}.dump"

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-${POSTGRES_USER:-acres_migrator}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-acres}}"

if [ -z "${PGPASSWORD:-}" ]; then
  printf 'backup error: PGPASSWORD environment variable is required\n' >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

printf 'Starting PostgreSQL backup for database "%s" on %s:%s...\n' "$PGDATABASE" "$PGHOST" "$PGPORT"

# Run pg_dump in custom archive format (-Fc)
PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGDATABASE="$PGDATABASE" \
  pg_dump --format=custom --no-owner --no-privileges --file="$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  printf 'backup error: generated backup file is empty or missing: %s\n' "$BACKUP_FILE" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

chmod 600 "$BACKUP_FILE"
FILE_BYTES="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"

printf 'PostgreSQL backup completed successfully: %s (%s bytes)\n' "$BACKUP_FILE" "$FILE_BYTES"
