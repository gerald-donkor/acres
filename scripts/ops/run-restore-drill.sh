#!/usr/bin/env bash
set -euo pipefail

# Restores a fresh source dump into a database created and owned by this run.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
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
  --host <host>                Database host (default: localhost or $PGHOST)
  --port <port>                Database port 1-65535 (default: 5432 or $PGPORT)
  --user <user>                Database user (default: postgres or $PGUSER)
  --cwd <path>                 Working directory for relative paths (default: .)
  --keep-drill-db              Retain the database created by this invocation
  --keep-backup                Retain the archive created by this invocation
  --dry-run                    Check input and server readiness; no dump or restore
  --help, -h                   Show this help
HELP
}

fail() { printf 'drill error: %s\n' "$*" >&2; exit 1; }

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
TARGET_CWD="."

CWD_SPECIFIED=0
HOST_SPECIFIED=0
PORT_SPECIFIED=0
USER_SPECIFIED=0
SOURCE_DB_SPECIFIED=0
DRILL_DB_SPECIFIED=0
BACKUP_DIR_SPECIFIED=0
EVIDENCE_FILE_SPECIFIED=0
RTO_SPECIFIED=0

while (($#)); do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --cwd=*)
      if ((CWD_SPECIFIED)); then
        fail 'repeated --cwd option; expected single directory path'
      fi
      val="${1#--cwd=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--cwd requires a nonempty value'
      fi
      TARGET_CWD="$val"
      CWD_SPECIFIED=1
      shift ;;
    --cwd)
      if ((CWD_SPECIFIED)); then
        fail 'repeated --cwd option; expected single directory path'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--cwd requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--cwd requires a nonempty value'
      fi
      TARGET_CWD="$2"
      CWD_SPECIFIED=1
      shift 2 ;;
    --host=*)
      if ((HOST_SPECIFIED)); then
        fail 'repeated --host option; expected single host'
      fi
      val="${1#--host=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--host requires a nonempty value'
      fi
      PGHOST="$val"
      HOST_SPECIFIED=1
      shift ;;
    --host)
      if ((HOST_SPECIFIED)); then
        fail 'repeated --host option; expected single host'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--host requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--host requires a nonempty value'
      fi
      PGHOST="$2"
      HOST_SPECIFIED=1
      shift 2 ;;
    --port=*)
      if ((PORT_SPECIFIED)); then
        fail 'repeated --port option; expected single port'
      fi
      val="${1#--port=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--port requires a nonempty value'
      fi
      PGPORT="$val"
      PORT_SPECIFIED=1
      shift ;;
    --port)
      if ((PORT_SPECIFIED)); then
        fail 'repeated --port option; expected single port'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--port requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--port requires a nonempty value'
      fi
      PGPORT="$2"
      PORT_SPECIFIED=1
      shift 2 ;;
    --user=*)
      if ((USER_SPECIFIED)); then
        fail 'repeated --user option; expected single user'
      fi
      val="${1#--user=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--user requires a nonempty value'
      fi
      PGUSER="$val"
      USER_SPECIFIED=1
      shift ;;
    --user)
      if ((USER_SPECIFIED)); then
        fail 'repeated --user option; expected single user'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--user requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--user requires a nonempty value'
      fi
      PGUSER="$2"
      USER_SPECIFIED=1
      shift 2 ;;
    --source-db=*)
      if ((SOURCE_DB_SPECIFIED)); then
        fail 'repeated --source-db option; expected single value'
      fi
      val="${1#--source-db=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--source-db requires a nonempty value'
      fi
      SOURCE_DB="$val"
      SOURCE_DB_SPECIFIED=1
      shift ;;
    --source-db)
      if ((SOURCE_DB_SPECIFIED)); then
        fail 'repeated --source-db option; expected single value'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--source-db requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--source-db requires a nonempty value'
      fi
      SOURCE_DB="$2"
      SOURCE_DB_SPECIFIED=1
      shift 2 ;;
    --drill-db=*)
      if ((DRILL_DB_SPECIFIED)); then
        fail 'repeated --drill-db option; expected single value'
      fi
      val="${1#--drill-db=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--drill-db requires a nonempty value'
      fi
      DRILL_DB="$val"
      DRILL_DB_SPECIFIED=1
      shift ;;
    --drill-db)
      if ((DRILL_DB_SPECIFIED)); then
        fail 'repeated --drill-db option; expected single value'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--drill-db requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--drill-db requires a nonempty value'
      fi
      DRILL_DB="$2"
      DRILL_DB_SPECIFIED=1
      shift 2 ;;
    --backup-dir=*)
      if ((BACKUP_DIR_SPECIFIED)); then
        fail 'repeated --backup-dir option; expected single value'
      fi
      val="${1#--backup-dir=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--backup-dir requires a nonempty value'
      fi
      BACKUP_DIR="$val"
      BACKUP_DIR_SPECIFIED=1
      shift ;;
    --backup-dir)
      if ((BACKUP_DIR_SPECIFIED)); then
        fail 'repeated --backup-dir option; expected single value'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--backup-dir requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--backup-dir requires a nonempty value'
      fi
      BACKUP_DIR="$2"
      BACKUP_DIR_SPECIFIED=1
      shift 2 ;;
    --evidence-file=*)
      if ((EVIDENCE_FILE_SPECIFIED)); then
        fail 'repeated --evidence-file option; expected single value'
      fi
      val="${1#--evidence-file=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--evidence-file requires a nonempty value'
      fi
      EVIDENCE_FILE="$val"
      EVIDENCE_FILE_SPECIFIED=1
      shift ;;
    --evidence-file)
      if ((EVIDENCE_FILE_SPECIFIED)); then
        fail 'repeated --evidence-file option; expected single value'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--evidence-file requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--evidence-file requires a nonempty value'
      fi
      EVIDENCE_FILE="$2"
      EVIDENCE_FILE_SPECIFIED=1
      shift 2 ;;
    --rto-target-seconds=*)
      if ((RTO_SPECIFIED)); then
        fail 'repeated --rto-target-seconds option; expected single value'
      fi
      val="${1#--rto-target-seconds=}"
      trimmed="$(printf '%s' "$val" | tr -d '[:space:]')"
      if [[ -z "$val" || -z "$trimmed" ]]; then
        fail '--rto-target-seconds requires a nonempty value'
      fi
      RTO_TARGET_SECONDS="$val"
      RTO_SPECIFIED=1
      shift ;;
    --rto-target-seconds)
      if ((RTO_SPECIFIED)); then
        fail 'repeated --rto-target-seconds option; expected single value'
      fi
      if (($# < 2)) || [[ -z "$2" || "$2" == -* ]]; then
        fail '--rto-target-seconds requires a nonempty value'
      fi
      trimmed="$(printf '%s' "$2" | tr -d '[:space:]')"
      if [[ -z "$trimmed" ]]; then
        fail '--rto-target-seconds requires a nonempty value'
      fi
      RTO_TARGET_SECONDS="$2"
      RTO_SPECIFIED=1
      shift 2 ;;
    --keep-drill-db) KEEP_DRILL_DB=1; shift ;;
    --keep-backup) KEEP_BACKUP=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -*)
      fail "unknown option $1"
      ;;
    *)
      fail "unexpected argument $1"
      ;;
  esac
done

if [[ ! -d "$TARGET_CWD" ]]; then
  fail "target directory does not exist: $TARGET_CWD"
fi
RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"

for db in "$SOURCE_DB" "$DRILL_DB"; do
  if [[ ! "$db" =~ ^[A-Za-z_][A-Za-z_0-9]{0,62}$ ]]; then
    fail "invalid database identifier: $db"
  fi
done
if [[ "$SOURCE_DB" == "$DRILL_DB" ]]; then
  fail "source and drill databases must differ"
fi
case "$DRILL_DB" in
  postgres|template0|template1|acres)
    fail "protected drill database: $DRILL_DB"
    ;;
esac

case "$PGPORT" in
  ''|*[!0-9]*|??????*)
    fail "invalid port: $PGPORT (expected integer 1-65535)"
    ;;
esac
if (( 10#$PGPORT < 1 || 10#$PGPORT > 65535 )); then
  fail "invalid port: $PGPORT (expected integer 1-65535)"
fi

if [[ ! "$RTO_TARGET_SECONDS" =~ ^[1-9][0-9]*$ ]] || (( ${#RTO_TARGET_SECONDS} > 9 )) || (( RTO_TARGET_SECONDS > 2147483 )); then
  fail "RTO target must be a positive integer no greater than 2147483"
fi

for tool in pg_dump pg_restore psql pg_isready node date mktemp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    fail "$tool utility not found in PATH"
  fi
done

PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-${POSTGRES_SUPERUSER_PASSWORD:-${ACRES_MIGRATOR_PASSWORD:-}}}}"
TRIMMED_PGPASSWORD="$(printf '%s' "$PGPASSWORD" | tr -d '[:space:]')"
if [[ -z "$PGPASSWORD" || -z "$TRIMMED_PGPASSWORD" ]]; then
  fail "PGPASSWORD is required"
fi
export PGHOST PGPORT PGUSER PGPASSWORD

if [[ "$BACKUP_DIR" != /* ]]; then
  BACKUP_DIR="$RESOLVED_CWD/$BACKUP_DIR"
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
if [[ -z "$EVIDENCE_FILE" ]]; then
  EVIDENCE_FILE="$BACKUP_DIR/restore-drill-evidence-$TIMESTAMP-$$.json"
elif [[ "$EVIDENCE_FILE" != /* ]]; then
  EVIDENCE_FILE="$RESOLVED_CWD/$EVIDENCE_FILE"
fi

if [[ -e "$EVIDENCE_FILE" || -L "$EVIDENCE_FILE" ]]; then
  fail "evidence destination already exists: $EVIDENCE_FILE"
fi

sql() { psql -X -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$1" -v ON_ERROR_STOP=1 -t -A -c "$2"; }
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
"$SCRIPT_DIR/restore-postgres.sh" "--cwd=$RESOLVED_CWD" "--host=$PGHOST" "--port=$PGPORT" "--user=$PGUSER" "--dbname=$DRILL_DB" "$CREATED_BACKUP" || fail 'restore failed'
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
