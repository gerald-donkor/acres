#!/usr/bin/env bash
set -euo pipefail

# Restores a fresh source dump into a database created and owned by this run.
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

while (($#)); do
  case "$1" in
    --source-db|--drill-db|--backup-dir|--evidence-file|--rto-target-seconds)
      option="$1"
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        printf 'drill error: %s requires a nonempty value\n' "$option" >&2
        exit 1
      fi
      case "$option" in
        --source-db) SOURCE_DB="$2" ;;
        --drill-db) DRILL_DB="$2" ;;
        --backup-dir) BACKUP_DIR="$2" ;;
        --evidence-file) EVIDENCE_FILE="$2" ;;
        --rto-target-seconds) RTO_TARGET_SECONDS="$2" ;;
      esac
      shift 2 ;;
    --keep-drill-db) KEEP_DRILL_DB=1; shift ;;
    --keep-backup) KEEP_BACKUP=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/ops/run-restore-drill.sh [options]

Rehearsal drill: creates an isolated drill database, restores a fresh source dump,
and measures local RTO. Does not perform live production restore or off-host recovery;
receipts are simulation.

Options:
  --source-db <name>           Source database (default: acres)
  --drill-db <name>            New, absent target database (default: acres_restore_drill)
  --backup-dir <dir>           Private archive directory (default: backups)
  --evidence-file <file>       Success JSON destination (default: backup-dir/restore-drill-evidence-<timestamp>-<pid>.json)
  --rto-target-seconds <sec>   Positive integer target (default: 300)
  --keep-drill-db              Retain the database created by this invocation
  --keep-backup                Retain the archive created by this invocation
  --dry-run                    Check input and server readiness; no dump or restore
  --help, -h                   Show this help
HELP
      exit 0 ;;
    *) printf 'drill error: unknown option %s\n' "$1" >&2; exit 1 ;;
  esac
done

for db in "$SOURCE_DB" "$DRILL_DB"; do
  if [[ ! "$db" =~ ^[A-Za-z_][A-Za-z_0-9]{0,62}$ ]]; then
    printf 'drill error: invalid database identifier: %s\n' "$db" >&2
    exit 1
  fi
done
if [[ "$SOURCE_DB" == "$DRILL_DB" ]]; then
  printf 'drill error: source and drill databases must differ\n' >&2
  exit 1
fi
case "$DRILL_DB" in
  postgres|template0|template1|acres)
    printf 'drill error: protected drill database: %s\n' "$DRILL_DB" >&2
    exit 1 ;;
esac
if [[ ! "$RTO_TARGET_SECONDS" =~ ^[1-9][0-9]*$ ]] || (( ${#RTO_TARGET_SECONDS} > 9 )) || (( RTO_TARGET_SECONDS > 2147483 )); then
  printf 'drill error: RTO target must be a positive integer no greater than 2147483\n' >&2
  exit 1
fi
PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-${POSTGRES_SUPERUSER_PASSWORD:-${ACRES_MIGRATOR_PASSWORD:-}}}}"
if [[ -z "$PGPASSWORD" ]]; then
  printf 'drill error: PGPASSWORD is required\n' >&2
  exit 1
fi
export PGHOST PGPORT PGUSER PGPASSWORD
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -z "$EVIDENCE_FILE" ]]; then
  EVIDENCE_FILE="$BACKUP_DIR/restore-drill-evidence-$TIMESTAMP-$$.json"
fi
if [[ -e "$EVIDENCE_FILE" || -L "$EVIDENCE_FILE" ]]; then
  printf 'drill error: evidence destination already exists: %s\n' "$EVIDENCE_FILE" >&2
  exit 1
fi

sql() { psql -X -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$1" -v ON_ERROR_STOP=1 -t -A -c "$2"; }
fail() { printf 'drill error: %s\n' "$*" >&2; exit 1; }
count() {
  local result
  result="$(sql "$1" "$2")" || fail "count query failed on $1"
  [[ "$result" =~ ^(0|[1-9][0-9]*)$ && ${#result} -le 15 ]] || fail "invalid count result on $1"
  printf '%s' "$result"
}
records() {
  local result
  result="$(sql "$1" "SELECT json_build_object('accounts',(SELECT count(*) FROM \"Account\"),'organizations',(SELECT count(*) FROM \"Organization\"),'stored_objects',(SELECT count(*) FROM \"StoredObject\"),'datasets',(SELECT count(*) FROM \"Dataset\"),'regions',(SELECT count(*) FROM \"Region\"));")" || fail "record query failed on $1"
  [[ -n "$result" && "$result" != '{}' ]] || fail "empty record counts on $1"
  # Compare parsed JSON values so whitespace and key order cannot cause false parity.
  node -e 'const v=JSON.parse(process.argv[1]); const keys=["accounts","organizations","stored_objects","datasets","regions"]; if(keys.some(k=>!Number.isSafeInteger(v[k])||v[k]<0))process.exit(1); process.stdout.write(JSON.stringify(keys.map(k=>v[k])))' "$result" || fail "invalid record counts on $1"
}
get_time_ms() { date +%s%3N; }

pg_isready -h "$PGHOST" -p "$PGPORT" >/dev/null || fail "PostgreSQL is not ready"
# pg_isready alone does not authenticate. Both connections must succeed.
sql postgres 'SELECT 1;' >/dev/null || fail 'maintenance database authentication failed'
sql "$SOURCE_DB" 'SELECT 1;' >/dev/null || fail 'source database authentication failed'
existing="$(count postgres "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB';")"
[[ "$existing" == 0 ]] || fail "drill database already exists: $DRILL_DB"
if ((DRY_RUN)); then
  printf '[DRY RUN] Validated credentials, source and absent target.\n'
  exit 0
fi

CREATED_BACKUP=''
DRILL_DB_CREATED=0
CREATED_DB_ID=''
cleanup() {
  local prior=$? cleanup_failed=0
  trap - EXIT INT TERM HUP
  if ((DRILL_DB_CREATED && !KEEP_DRILL_DB)); then
    # Never terminate other sessions. If a session blocks DROP, leave the target for operator review.
    current_db_id="$(sql postgres "SELECT oid::text || ':' || datdba::text FROM pg_database WHERE datname = '$DRILL_DB';")" || current_db_id=''
    if [[ -z "$CREATED_DB_ID" || "$current_db_id" != "$CREATED_DB_ID" ]]; then
      printf 'drill error: owned drill database identity changed or could not be checked: %s\n' "$DRILL_DB" >&2
      cleanup_failed=1
    elif ! sql postgres "DROP DATABASE \"$DRILL_DB\";" >/dev/null; then
      printf 'drill error: could not remove owned drill database %s; investigate manually\n' "$DRILL_DB" >&2
      cleanup_failed=1
    fi
  fi
  if [[ -n "$CREATED_BACKUP" && -f "$CREATED_BACKUP" ]]; then
    if ((KEEP_BACKUP || cleanup_failed)); then
      printf 'drill archive retained: %s\n' "$CREATED_BACKUP" >&2
    elif ! rm -f -- "$CREATED_BACKUP"; then
      printf 'drill error: could not remove owned archive %s\n' "$CREATED_BACKUP" >&2
      cleanup_failed=1
    fi
  fi
  if ((prior == 0 && cleanup_failed == 0)); then
    if ! write_evidence; then
      printf 'drill error: could not publish success evidence\n' >&2
      prior=1
    fi
  fi
  if ((cleanup_failed)); then prior=1; fi
  exit "$prior"
}
write_evidence() {
  local parent temp
  parent="$(dirname -- "$EVIDENCE_FILE")"
  mkdir -p -- "$parent" || return 1
  temp="$(mktemp "$parent/.restore-drill-evidence.XXXXXXXX")" || return 1
  if ! TIMESTAMP="$TIMESTAMP" SOURCE_DB="$SOURCE_DB" DRILL_DB="$DRILL_DB" BACKUP_FILE="$CREATED_BACKUP" BACKUP_BYTES="$BACKUP_BYTES" DURATION_MS="$DURATION_MS" RTO_TARGET_SECONDS="$RTO_TARGET_SECONDS" TABLES_SOURCE="$TABLES_SOURCE" TABLES_RESTORED="$TABLES_RESTORED" MIGRATIONS_SOURCE="$MIGRATIONS_SOURCE" MIGRATIONS_RESTORED="$MIGRATIONS_RESTORED" node -e '
const e=process.env;
const n=k=>Number(e[k]);
const report={execution_mode:"simulation",drill_type:"disaster_recovery_restore",drill_timestamp:e.TIMESTAMP,source_db:e.SOURCE_DB,drill_db:e.DRILL_DB,backup_file:e.BACKUP_FILE,backup_bytes:n("BACKUP_BYTES"),duration_ms:n("DURATION_MS"),duration_seconds:Math.floor(n("DURATION_MS")/1000),rto_target_seconds:n("RTO_TARGET_SECONDS"),rto_compliant:true,tables_source:n("TABLES_SOURCE"),tables_restored:n("TABLES_RESTORED"),migrations_source:n("MIGRATIONS_SOURCE"),migrations_restored:n("MIGRATIONS_RESTORED"),postgis_verified:true,foreign_keys_verified:true,record_parity_verified:true,status:"success"};
process.stdout.write(JSON.stringify(report,null,2)+"\n");' > "$temp"; then
    rm -f -- "$temp"; return 1
  fi
  if [[ -e "$EVIDENCE_FILE" || -L "$EVIDENCE_FILE" ]]; then rm -f -- "$temp"; return 1; fi
  if ! ln -- "$temp" "$EVIDENCE_FILE"; then rm -f -- "$temp"; return 1; fi
  rm -f -- "$temp"
  printf 'Drill evidence saved to: %s\n' "$EVIDENCE_FILE"
  printf 'DISASTER RECOVERY RESTORE DRILL PASSED (simulation rehearsal)\n'
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

START_TIME_MS="$(get_time_ms)"
TABLES_SOURCE="$(count "$SOURCE_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
MIGRATIONS_SOURCE="$(count "$SOURCE_DB" 'SELECT count(*) FROM "_prisma_migrations" WHERE rolled_back_at IS NULL;')"
RECORDS_SOURCE="$(records "$SOURCE_DB")"
mkdir -p -m 700 -- "$BACKUP_DIR"
CREATED_BACKUP="$(mktemp "$BACKUP_DIR/acres-drill-$TIMESTAMP-XXXXXXXX.dump")"
chmod 600 "$CREATED_BACKUP"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$SOURCE_DB" --format=custom --no-owner --no-privileges --file="$CREATED_BACKUP" || fail 'backup creation failed'
[[ -s "$CREATED_BACKUP" ]] || fail 'backup is empty'
BACKUP_BYTES="$(wc -c < "$CREATED_BACKUP" | tr -d ' ')"
pg_restore --list "$CREATED_BACKUP" >/dev/null || fail 'backup archive validation failed'
# CREATE DATABASE is a single checked statement; an existence race fails safely.
sql postgres "CREATE DATABASE \"$DRILL_DB\";" >/dev/null || fail "could not create drill database $DRILL_DB"
DRILL_DB_CREATED=1
CREATED_DB_ID="$(sql postgres "SELECT oid::text || ':' || datdba::text FROM pg_database WHERE datname = '$DRILL_DB';")" || fail "could not confirm created database identity: $DRILL_DB"
[[ "$CREATED_DB_ID" =~ ^[0-9]+:[0-9]+$ ]] || fail "invalid created database identity: $DRILL_DB"
PGDATABASE="$DRILL_DB" scripts/ops/restore-postgres.sh "$CREATED_BACKUP" || fail 'restore failed'
TABLES_RESTORED="$(count "$DRILL_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
MIGRATIONS_RESTORED="$(count "$DRILL_DB" 'SELECT count(*) FROM "_prisma_migrations" WHERE rolled_back_at IS NULL;')"
POSTGIS_COUNT="$(count "$DRILL_DB" "SELECT count(*) FROM pg_extension WHERE extname = 'postgis';")"
UNVALIDATED_FKS="$(count "$DRILL_DB" "SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated;")"
RECORDS_RESTORED="$(records "$DRILL_DB")"
[[ "$TABLES_SOURCE" == "$TABLES_RESTORED" ]] || fail 'table count mismatch'
[[ "$MIGRATIONS_SOURCE" == "$MIGRATIONS_RESTORED" ]] || fail 'migration count mismatch'
((POSTGIS_COUNT >= 1)) || fail 'PostGIS missing'
((UNVALIDATED_FKS == 0)) || fail 'unvalidated foreign keys present'
[[ "$RECORDS_SOURCE" == "$RECORDS_RESTORED" ]] || fail 'record count mismatch'
DURATION_MS=$(( $(get_time_ms) - START_TIME_MS ))
((DURATION_MS >= 0)) || fail 'invalid elapsed time'
((DURATION_MS <= RTO_TARGET_SECONDS * 1000)) || fail "RTO exceeded: ${DURATION_MS}ms > ${RTO_TARGET_SECONDS}s"
