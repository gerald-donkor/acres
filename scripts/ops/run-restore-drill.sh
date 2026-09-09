#!/usr/bin/env bash
set -euo pipefail

# scripts/ops/run-restore-drill.sh
#
# Automated Disaster Recovery Restore Drill Runner for Acres.
# Executes an automated end-to-end backup and restore verification against an
# isolated target drill database, verifying table counts, migration parity,
# PostGIS extensions, foreign key constraints, and record invariants.

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
SOURCE_DB="${SOURCE_DB:-${PGDATABASE:-acres}}"
DRILL_DB="${DRILL_DB:-acres_restore_drill}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
RTO_TARGET_SECONDS="${RTO_TARGET_SECONDS:-300}"
EVIDENCE_FILE="${EVIDENCE_FILE:-}"
KEEP_DRILL_DB=0
KEEP_BACKUP=0
DRY_RUN=0

# Password resolution
if [ -z "${PGPASSWORD:-}" ]; then
  if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    PGPASSWORD="$POSTGRES_PASSWORD"
  elif [ -n "${POSTGRES_SUPERUSER_PASSWORD:-}" ]; then
    PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD"
  elif [ -n "${ACRES_MIGRATOR_PASSWORD:-}" ]; then
    PGPASSWORD="$ACRES_MIGRATOR_PASSWORD"
  fi
fi

# Parse command line options
while [ $# -gt 0 ]; do
  case "$1" in
    --source-db)
      SOURCE_DB="$2"
      shift 2
      ;;
    --drill-db)
      DRILL_DB="$2"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    --evidence-file)
      EVIDENCE_FILE="$2"
      shift 2
      ;;
    --rto-target-seconds)
      RTO_TARGET_SECONDS="$2"
      shift 2
      ;;
    --keep-drill-db)
      KEEP_DRILL_DB=1
      shift
      ;;
    --keep-backup)
      KEEP_BACKUP=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/ops/run-restore-drill.sh [options]

Automated disaster recovery drill runner verifying backup, restore, schema parity,
and RTO compliance against an isolated database.

Options:
  --source-db <name>           Source database to back up (default: acres)
  --drill-db <name>            Target drill database for restore (default: acres_restore_drill)
  --backup-dir <dir>           Directory for temporary backup archive (default: backups)
  --evidence-file <file>       Path to output JSON evidence report (default: backups/restore-drill-evidence-<timestamp>.json)
  --rto-target-seconds <sec>   Target Recovery Time Objective in seconds (default: 300)
  --keep-drill-db              Preserve target drill database after verification
  --keep-backup                Preserve generated backup dump file after verification
  --dry-run                    Verify configuration without executing backup/restore
  --help, -h                   Show this help message
EOF
      exit 0
      ;;
    *)
      printf 'Error: Unknown option "%s"\n' "$1" >&2
      exit 1
      ;;
  esac
done

get_time_ms() {
  local ms
  ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$ms" =~ ^[0-9]+$ ]]; then
    echo "$ms"
  else
    echo "$(( $(date +%s) * 1000 ))"
  fi
}

if [ -z "${PGPASSWORD:-}" ]; then
  printf 'drill error: PGPASSWORD environment variable is required\n' >&2
  exit 1
fi

if [[ ! "$DRILL_DB" =~ ^[a-zA-Z0-9_]+$ ]]; then
  printf 'drill error: invalid database identifier "%s"\n' "$DRILL_DB" >&2
  exit 1
fi

if [ "$DRILL_DB" = "postgres" ] || [ "$DRILL_DB" = "template0" ] || [ "$DRILL_DB" = "template1" ] || [ "$DRILL_DB" = "acres" ]; then
  printf 'drill error: cannot use protected system or primary database "%s" as drill target\n' "$DRILL_DB" >&2
  exit 1
fi

if [ "$SOURCE_DB" = "$DRILL_DB" ]; then
  printf 'drill error: SOURCE_DB ("%s") and DRILL_DB ("%s") cannot be the same database!\n' "$SOURCE_DB" "$DRILL_DB" >&2
  exit 1
fi

export PGHOST PGPORT PGUSER PGPASSWORD

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [ -z "$EVIDENCE_FILE" ]; then
  EVIDENCE_FILE="${BACKUP_DIR}/restore-drill-evidence-${TIMESTAMP}.json"
fi

printf '=================================================================\n'
printf '           Acres Disaster Recovery Restore Drill Runner          \n'
printf '=================================================================\n'
printf 'Timestamp:           %s\n' "$TIMESTAMP"
printf 'Host:                %s:%s\n' "$PGHOST" "$PGPORT"
printf 'User:                %s\n' "$PGUSER"
printf 'Source Database:     %s\n' "$SOURCE_DB"
printf 'Target Drill DB:     %s\n' "$DRILL_DB"
printf 'RTO Target:          %s seconds\n' "$RTO_TARGET_SECONDS"
printf 'Evidence Destination:%s\n' "$EVIDENCE_FILE"
printf '=================================================================\n\n'

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[DRY RUN] Preflight verification only.\n'
  pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null
  printf '[DRY RUN] PostgreSQL ready. Configuration valid.\n'
  exit 0
fi

# Track created backup file and drill db for cleanup
CREATED_BACKUP=""
DRILL_DB_CREATED=0

cleanup() {
  local exit_status=$?
  if [ "$exit_status" -ne 0 ]; then
    printf '\n[DRILL FAILURE] Drill failed with exit code %s. Initiating cleanup...\n' "$exit_status" >&2
  fi

  if [ "$KEEP_DRILL_DB" -eq 0 ] && [ "$DRILL_DB_CREATED" -eq 1 ]; then
    printf 'Cleaning up drill database "%s"...\n' "$DRILL_DB"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" -v ON_ERROR_STOP=0 <<EOSQL >/dev/null 2>&1 || true
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DRILL_DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$DRILL_DB";
EOSQL
  fi

  if [ "$KEEP_BACKUP" -eq 0 ] && [ -n "$CREATED_BACKUP" ] && [ -f "$CREATED_BACKUP" ]; then
    printf 'Removing drill backup archive "%s"...\n' "$CREATED_BACKUP"
    rm -f "$CREATED_BACKUP"
  fi
}
trap cleanup EXIT

# 1. Verify PostgreSQL ready
printf '1. Checking PostgreSQL readiness...\n'
pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null || {
  printf 'drill error: PostgreSQL is not ready on %s:%s\n' "$PGHOST" "$PGPORT" >&2
  exit 1
}

START_TIME_MS="$(get_time_ms)"

# 2. Inspect source database baseline
printf '2. Inspecting source database "%s" baseline...\n' "$SOURCE_DB"
TABLES_SOURCE="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
MIGRATIONS_SOURCE="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL;" 2>/dev/null || echo 0)"
RECORDS_SOURCE="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" -v ON_ERROR_STOP=1 -t -A -c "
SELECT json_build_object(
  'accounts', (SELECT count(*) FROM \"Account\"),
  'organizations', (SELECT count(*) FROM \"Organization\"),
  'stored_objects', (SELECT count(*) FROM \"StoredObject\"),
  'datasets', (SELECT count(*) FROM \"Dataset\"),
  'regions', (SELECT count(*) FROM \"Region\")
);")"

if [ -z "$RECORDS_SOURCE" ] || [ "$RECORDS_SOURCE" = "{}" ]; then
  printf 'drill error: source database record count inspection query returned empty result\n' >&2
  exit 1
fi

printf '   Source public tables:      %s\n' "$TABLES_SOURCE"
printf '   Source applied migrations: %s\n' "$MIGRATIONS_SOURCE"
printf '   Source record counts:      %s\n' "$RECORDS_SOURCE"

# 3. Create fresh timestamped backup
printf '\n3. Generating PostgreSQL backup archive...\n'
BACKUP_FILE="${BACKUP_DIR}/acres-drill-${TIMESTAMP}.dump"
CREATED_BACKUP="$BACKUP_FILE"

PGDATABASE="$SOURCE_DB" BACKUP_DIR="$BACKUP_DIR" \
  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" \
  --format=custom --no-owner --no-privileges --file="$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  printf 'drill error: generated backup file is missing or empty: %s\n' "$BACKUP_FILE" >&2
  exit 1
fi

chmod 600 "$BACKUP_FILE"
BACKUP_BYTES="$(wc -c < "$BACKUP_FILE" | tr -d ' ')"
printf '   Backup created: %s (%s bytes)\n' "$BACKUP_FILE" "$BACKUP_BYTES"

# Verify archive integrity
printf '   Verifying dump archive integrity...\n'
pg_restore --list "$BACKUP_FILE" >/dev/null || {
  printf 'drill error: backup archive failed pg_restore --list verification: %s\n' "$BACKUP_FILE" >&2
  exit 1
}

# 4. Prepare target isolated drill database
printf '\n4. Preparing isolated drill database "%s"...\n' "$DRILL_DB"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" <<EOSQL >/dev/null
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DRILL_DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$DRILL_DB";
CREATE DATABASE "$DRILL_DB" OWNER "$PGUSER";
EOSQL
DRILL_DB_CREATED=1

# 5. Execute restore into drill database
printf '\n5. Restoring backup archive into "%s" using restore-postgres.sh...\n' "$DRILL_DB"
PGDATABASE="$DRILL_DB" scripts/ops/restore-postgres.sh "$BACKUP_FILE"

# 6. Verify schema parity and invariants
printf '\n6. Verifying restored database integrity and parity...\n'

TABLES_RESTORED="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
MIGRATIONS_RESTORED="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM \"_prisma_migrations\" WHERE rolled_back_at IS NULL;" 2>/dev/null || echo 0)"
POSTGIS_COUNT="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM pg_extension WHERE extname = 'postgis';")"
UNVALIDATED_FKS="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -t -A -c "SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated;")"
RECORDS_RESTORED="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 -t -A -c "
SELECT json_build_object(
  'accounts', (SELECT count(*) FROM \"Account\"),
  'organizations', (SELECT count(*) FROM \"Organization\"),
  'stored_objects', (SELECT count(*) FROM \"StoredObject\"),
  'datasets', (SELECT count(*) FROM \"Dataset\"),
  'regions', (SELECT count(*) FROM \"Region\")
);")"

if [ -z "$RECORDS_RESTORED" ] || [ "$RECORDS_RESTORED" = "{}" ]; then
  printf 'drill error: restored database record count inspection query returned empty result\n' >&2
  exit 1
fi

printf '   Restored public tables:      %s (source: %s)\n' "$TABLES_RESTORED" "$TABLES_SOURCE"
printf '   Restored applied migrations: %s (source: %s)\n' "$MIGRATIONS_RESTORED" "$MIGRATIONS_SOURCE"
printf '   PostGIS extension present:   %s\n' "$POSTGIS_COUNT"
printf '   Unvalidated foreign keys:    %s\n' "$UNVALIDATED_FKS"
printf '   Restored record counts:      %s\n' "$RECORDS_RESTORED"

# Assertions
if [ "$TABLES_SOURCE" -ne "$TABLES_RESTORED" ]; then
  printf 'drill error: Table count mismatch! Source: %s, Restored: %s\n' "$TABLES_SOURCE" "$TABLES_RESTORED" >&2
  exit 1
fi

if [ "$MIGRATIONS_SOURCE" -ne "$MIGRATIONS_RESTORED" ]; then
  printf 'drill error: Migration count mismatch! Source: %s, Restored: %s\n' "$MIGRATIONS_SOURCE" "$MIGRATIONS_RESTORED" >&2
  exit 1
fi

if [ "$POSTGIS_COUNT" -lt 1 ]; then
  printf 'drill error: PostGIS spatial extension missing from restored database!\n' >&2
  exit 1
fi

if [ "$UNVALIDATED_FKS" -ne 0 ]; then
  printf 'drill error: Found %s unvalidated foreign key constraints in restored database!\n' "$UNVALIDATED_FKS" >&2
  exit 1
fi

if [ "$RECORDS_SOURCE" != "$RECORDS_RESTORED" ]; then
  printf 'drill error: Record invariants mismatch! Source: %s, Restored: %s\n' "$RECORDS_SOURCE" "$RECORDS_RESTORED" >&2
  exit 1
fi

# 7. Measure RTO Compliance
END_TIME_MS="$(get_time_ms)"
DURATION_MS=$(( END_TIME_MS - START_TIME_MS ))
DURATION_SEC=$(( DURATION_MS / 1000 ))

RTO_COMPLIANT=false
if [ "$DURATION_SEC" -le "$RTO_TARGET_SECONDS" ]; then
  RTO_COMPLIANT=true
fi

printf '\n7. RTO (Recovery Time Objective) Evaluation:\n'
printf '   Elapsed Time:     %s ms (%s seconds)\n' "$DURATION_MS" "$DURATION_SEC"
printf '   Target Threshold: %s seconds\n' "$RTO_TARGET_SECONDS"
printf '   RTO Compliant:    %s\n' "$RTO_COMPLIANT"

# 8. Emit Structured JSON Evidence Report
mkdir -p "$(dirname "$EVIDENCE_FILE")"
cat > "$EVIDENCE_FILE" <<EOF
{
  "drill_timestamp": "${TIMESTAMP}",
  "source_db": "${SOURCE_DB}",
  "drill_db": "${DRILL_DB}",
  "backup_file": "${BACKUP_FILE}",
  "backup_bytes": ${BACKUP_BYTES},
  "duration_ms": ${DURATION_MS},
  "duration_seconds": ${DURATION_SEC},
  "rto_target_seconds": ${RTO_TARGET_SECONDS},
  "rto_compliant": ${RTO_COMPLIANT},
  "tables_source": ${TABLES_SOURCE},
  "tables_restored": ${TABLES_RESTORED},
  "migrations_source": ${MIGRATIONS_SOURCE},
  "migrations_restored": ${MIGRATIONS_RESTORED},
  "postgis_verified": true,
  "foreign_keys_verified": true,
  "record_parity_verified": true,
  "status": "success"
}
EOF

printf '\nDrill evidence saved to: %s\n' "$EVIDENCE_FILE"
printf '\n=================================================================\n'
printf '             DISASTER RECOVERY RESTORE DRILL PASSED              \n'
printf '=================================================================\n'
