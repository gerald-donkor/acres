#!/bin/sh
set -eu

usage() {
  printf 'Usage: scripts/ops/restore-postgres.sh [<backup-file>] [--file <file> | --file=<file>] [--input-file <file> | --input-file=<file>] [--cwd <path> | --cwd=<path>] [--host <host> | --host=<host>] [--port <port> | --port=<port>] [--user <user> | --user=<user>] [--dbname <db> | --dbname=<db>] [--clean | --no-clean] [--dry-run]\n'
}

fail() {
  printf 'restore error: %s\n' "$1" >&2
  exit 1
}

TARGET_CWD="."
CWD_SPECIFIED=0

HOST_VAL=""
HOST_SPECIFIED=0

PORT_VAL=""
PORT_SPECIFIED=0

USER_VAL=""
USER_SPECIFIED=0

DBNAME_VAL=""
DBNAME_SPECIFIED=0

BACKUP_FILE_VAL=""
BACKUP_FILE_SPECIFIED=0

CLEAN_MODE="default"

DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --cwd=*)
      if [ "$CWD_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --cwd option; expected single directory path\n' >&2
        usage >&2
        exit 1
      fi
      RAW_CWD="${1#--cwd=}"
      TRIMMED_CWD="$(printf '%s' "$RAW_CWD" | tr -d '[:space:]')"
      if [ -z "$RAW_CWD" ] || [ -z "$TRIMMED_CWD" ]; then
        printf 'Error: --cwd path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      TARGET_CWD="$RAW_CWD"
      CWD_SPECIFIED=1
      shift
      ;;
    --cwd)
      if [ "$CWD_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --cwd option; expected single directory path\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --cwd requires a non-empty directory path\n' >&2
        usage >&2
        exit 1
      fi
      RAW_CWD="$2"
      case "$RAW_CWD" in
        -*)
          printf 'Error: --cwd requires a non-empty directory path\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_CWD="$(printf '%s' "$RAW_CWD" | tr -d '[:space:]')"
      if [ -z "$RAW_CWD" ] || [ -z "$TRIMMED_CWD" ]; then
        printf 'Error: --cwd path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      TARGET_CWD="$RAW_CWD"
      CWD_SPECIFIED=1
      shift 2
      ;;
    --host=*)
      if [ "$HOST_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --host option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_HOST="${1#--host=}"
      TRIMMED_HOST="$(printf '%s' "$RAW_HOST" | tr -d '[:space:]')"
      if [ -z "$RAW_HOST" ] || [ -z "$TRIMMED_HOST" ]; then
        printf 'Error: --host cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      HOST_VAL="$RAW_HOST"
      HOST_SPECIFIED=1
      shift
      ;;
    --host)
      if [ "$HOST_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --host option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --host requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_HOST="$2"
      case "$RAW_HOST" in
        -*)
          printf 'Error: --host requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_HOST="$(printf '%s' "$RAW_HOST" | tr -d '[:space:]')"
      if [ -z "$RAW_HOST" ] || [ -z "$TRIMMED_HOST" ]; then
        printf 'Error: --host cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      HOST_VAL="$RAW_HOST"
      HOST_SPECIFIED=1
      shift 2
      ;;
    --port=*)
      if [ "$PORT_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --port option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_PORT="${1#--port=}"
      TRIMMED_PORT="$(printf '%s' "$RAW_PORT" | tr -d '[:space:]')"
      if [ -z "$RAW_PORT" ] || [ -z "$TRIMMED_PORT" ]; then
        printf 'Error: --port cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      case "$RAW_PORT" in
        ''|*[!0-9]*|??????*)
          printf 'Error: Invalid --port "%s" (expected integer 1-65535)\n' "$RAW_PORT" >&2
          usage >&2
          exit 1
          ;;
      esac
      if [ "$RAW_PORT" -lt 1 ] || [ "$RAW_PORT" -gt 65535 ]; then
        printf 'Error: Invalid --port "%s" (expected integer 1-65535)\n' "$RAW_PORT" >&2
        usage >&2
        exit 1
      fi
      PORT_VAL="$RAW_PORT"
      PORT_SPECIFIED=1
      shift
      ;;
    --port)
      if [ "$PORT_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --port option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --port requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_PORT="$2"
      case "$RAW_PORT" in
        -*)
          printf 'Error: --port requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_PORT="$(printf '%s' "$RAW_PORT" | tr -d '[:space:]')"
      if [ -z "$RAW_PORT" ] || [ -z "$TRIMMED_PORT" ]; then
        printf 'Error: --port cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      case "$RAW_PORT" in
        ''|*[!0-9]*|??????*)
          printf 'Error: Invalid --port "%s" (expected integer 1-65535)\n' "$RAW_PORT" >&2
          usage >&2
          exit 1
          ;;
      esac
      if [ "$RAW_PORT" -lt 1 ] || [ "$RAW_PORT" -gt 65535 ]; then
        printf 'Error: Invalid --port "%s" (expected integer 1-65535)\n' "$RAW_PORT" >&2
        usage >&2
        exit 1
      fi
      PORT_VAL="$RAW_PORT"
      PORT_SPECIFIED=1
      shift 2
      ;;
    --user=*)
      if [ "$USER_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --user option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_USER="${1#--user=}"
      TRIMMED_USER="$(printf '%s' "$RAW_USER" | tr -d '[:space:]')"
      if [ -z "$RAW_USER" ] || [ -z "$TRIMMED_USER" ]; then
        printf 'Error: --user cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      USER_VAL="$RAW_USER"
      USER_SPECIFIED=1
      shift
      ;;
    --user)
      if [ "$USER_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --user option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --user requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_USER="$2"
      case "$RAW_USER" in
        -*)
          printf 'Error: --user requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_USER="$(printf '%s' "$RAW_USER" | tr -d '[:space:]')"
      if [ -z "$RAW_USER" ] || [ -z "$TRIMMED_USER" ]; then
        printf 'Error: --user cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      USER_VAL="$RAW_USER"
      USER_SPECIFIED=1
      shift 2
      ;;
    --dbname=*)
      if [ "$DBNAME_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --dbname option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_DBNAME="${1#--dbname=}"
      TRIMMED_DBNAME="$(printf '%s' "$RAW_DBNAME" | tr -d '[:space:]')"
      if [ -z "$RAW_DBNAME" ] || [ -z "$TRIMMED_DBNAME" ]; then
        printf 'Error: --dbname cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      DBNAME_VAL="$RAW_DBNAME"
      DBNAME_SPECIFIED=1
      shift
      ;;
    --dbname)
      if [ "$DBNAME_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --dbname option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --dbname requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_DBNAME="$2"
      case "$RAW_DBNAME" in
        -*)
          printf 'Error: --dbname requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_DBNAME="$(printf '%s' "$RAW_DBNAME" | tr -d '[:space:]')"
      if [ -z "$RAW_DBNAME" ] || [ -z "$TRIMMED_DBNAME" ]; then
        printf 'Error: --dbname cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      DBNAME_VAL="$RAW_DBNAME"
      DBNAME_SPECIFIED=1
      shift 2
      ;;
    --file=*|--input-file=*)
      if [ "$BACKUP_FILE_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated backup file option\n' >&2
        usage >&2
        exit 1
      fi
      case "$1" in
        --file=*) RAW_FILE="${1#--file=}" ;;
        --input-file=*) RAW_FILE="${1#--input-file=}" ;;
      esac
      TRIMMED_FILE="$(printf '%s' "$RAW_FILE" | tr -d '[:space:]')"
      if [ -z "$RAW_FILE" ] || [ -z "$TRIMMED_FILE" ]; then
        printf 'Error: backup file path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      BACKUP_FILE_VAL="$RAW_FILE"
      BACKUP_FILE_SPECIFIED=1
      shift
      ;;
    --file|--input-file)
      OPT_NAME="$1"
      if [ "$BACKUP_FILE_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated backup file option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: %s requires a value\n' "$OPT_NAME" >&2
        usage >&2
        exit 1
      fi
      RAW_FILE="$2"
      case "$RAW_FILE" in
        -*)
          printf 'Error: %s requires a value\n' "$OPT_NAME" >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_FILE="$(printf '%s' "$RAW_FILE" | tr -d '[:space:]')"
      if [ -z "$RAW_FILE" ] || [ -z "$TRIMMED_FILE" ]; then
        printf 'Error: backup file path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      BACKUP_FILE_VAL="$RAW_FILE"
      BACKUP_FILE_SPECIFIED=1
      shift 2
      ;;
    --clean)
      if [ "$CLEAN_MODE" = "no-clean" ]; then
        printf 'Error: Conflicting --clean and --no-clean options\n' >&2
        usage >&2
        exit 1
      fi
      CLEAN_MODE="clean"
      shift
      ;;
    --no-clean)
      if [ "$CLEAN_MODE" = "clean" ]; then
        printf 'Error: Conflicting --clean and --no-clean options\n' >&2
        usage >&2
        exit 1
      fi
      CLEAN_MODE="no-clean"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -*)
      printf 'Error: Unknown option "%s"\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [ "$BACKUP_FILE_SPECIFIED" -eq 1 ]; then
        printf 'Error: Unexpected argument "%s"\n' "$1" >&2
        usage >&2
        exit 1
      fi
      TRIMMED_FILE="$(printf '%s' "$1" | tr -d '[:space:]')"
      if [ -z "$1" ] || [ -z "$TRIMMED_FILE" ]; then
        printf 'Error: backup file path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      BACKUP_FILE_VAL="$1"
      BACKUP_FILE_SPECIFIED=1
      shift
      ;;
  esac
done

if [ ! -d "$TARGET_CWD" ]; then
  fail "target directory does not exist: $TARGET_CWD"
fi

RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"

if [ "$BACKUP_FILE_SPECIFIED" -eq 0 ]; then
  fail "backup file path is required"
fi

case "$BACKUP_FILE_VAL" in
  /*) RESOLVED_BACKUP_FILE="$BACKUP_FILE_VAL" ;;
  *) RESOLVED_BACKUP_FILE="$RESOLVED_CWD/$BACKUP_FILE_VAL" ;;
esac

if [ ! -e "$RESOLVED_BACKUP_FILE" ]; then
  fail "backup file does not exist: $RESOLVED_BACKUP_FILE"
fi

if [ ! -f "$RESOLVED_BACKUP_FILE" ]; then
  fail "backup target is not a regular file: $RESOLVED_BACKUP_FILE"
fi

if [ ! -r "$RESOLVED_BACKUP_FILE" ]; then
  fail "backup file is not readable: $RESOLVED_BACKUP_FILE"
fi

if [ ! -s "$RESOLVED_BACKUP_FILE" ]; then
  fail "backup file is empty: $RESOLVED_BACKUP_FILE"
fi

FILE_BYTES="$(wc -c < "$RESOLVED_BACKUP_FILE" | tr -d ' ')"

# Verify required client utilities in PATH
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore utility not found in PATH"
command -v psql >/dev/null 2>&1 || fail "psql utility not found in PATH"
command -v pg_isready >/dev/null 2>&1 || fail "pg_isready utility not found in PATH"

# Resolve credentials across fallback chain without logging secrets
RESOLVED_PGPASSWORD="${PGPASSWORD:-}"
if [ -z "$RESOLVED_PGPASSWORD" ]; then
  if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    RESOLVED_PGPASSWORD="$POSTGRES_PASSWORD"
  elif [ -n "${POSTGRES_SUPERUSER_PASSWORD:-}" ]; then
    RESOLVED_PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD"
  elif [ -n "${ACRES_MIGRATOR_PASSWORD:-}" ]; then
    RESOLVED_PGPASSWORD="$ACRES_MIGRATOR_PASSWORD"
  fi
fi

if [ -z "$RESOLVED_PGPASSWORD" ]; then
  fail "PGPASSWORD environment variable is required"
fi

# Resolve database connection options
RESOLVED_PGHOST="${HOST_VAL:-${PGHOST:-localhost}}"
RESOLVED_PGPORT="${PORT_VAL:-${PGPORT:-5432}}"
RESOLVED_PGUSER="${USER_VAL:-${PGUSER:-${POSTGRES_USER:-postgres}}}"
RESOLVED_PGDATABASE="${DBNAME_VAL:-${PGDATABASE:-${POSTGRES_DB:-acres}}}"

case "$RESOLVED_PGPORT" in
  ''|*[!0-9]*|??????*)
    fail "invalid port: $RESOLVED_PGPORT (expected integer 1-65535)"
    ;;
esac
if [ "$RESOLVED_PGPORT" -lt 1 ] || [ "$RESOLVED_PGPORT" -gt 65535 ]; then
  fail "invalid port: $RESOLVED_PGPORT (expected integer 1-65535)"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[dry-run] PostgreSQL restore plan:\n'
  printf '[dry-run]   Host: %s\n' "$RESOLVED_PGHOST"
  printf '[dry-run]   Port: %s\n' "$RESOLVED_PGPORT"
  printf '[dry-run]   User: %s\n' "$RESOLVED_PGUSER"
  printf '[dry-run]   Database: %s\n' "$RESOLVED_PGDATABASE"
  printf '[dry-run]   Backup file: %s (%s bytes)\n' "$RESOLVED_BACKUP_FILE" "$FILE_BYTES"
  if [ "$CLEAN_MODE" = "no-clean" ]; then
    printf '[dry-run]   Clean mode: disabled\n'
  else
    printf '[dry-run]   Clean mode: enabled\n'
  fi
  printf '[dry-run] Dry run completed successfully.\n'
  exit 0
fi

printf 'Checking target PostgreSQL connection on %s:%s...\n' "$RESOLVED_PGHOST" "$RESOLVED_PGPORT"
PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGPASSWORD="$RESOLVED_PGPASSWORD" \
  pg_isready -h "$RESOLVED_PGHOST" -p "$RESOLVED_PGPORT" >/dev/null 2>&1 || {
  fail "PostgreSQL is not ready on $RESOLVED_PGHOST:$RESOLVED_PGPORT"
}

printf 'Restoring %s into database "%s" on %s:%s...\n' "$RESOLVED_BACKUP_FILE" "$RESOLVED_PGDATABASE" "$RESOLVED_PGHOST" "$RESOLVED_PGPORT"

if [ "$CLEAN_MODE" = "no-clean" ]; then
  PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGDATABASE="$RESOLVED_PGDATABASE" PGPASSWORD="$RESOLVED_PGPASSWORD" \
    pg_restore --no-owner --no-privileges --dbname="$RESOLVED_PGDATABASE" "$RESOLVED_BACKUP_FILE"
else
  PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGDATABASE="$RESOLVED_PGDATABASE" PGPASSWORD="$RESOLVED_PGPASSWORD" \
    pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESOLVED_PGDATABASE" "$RESOLVED_BACKUP_FILE"
fi

TABLE_COUNT="$(
  PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGDATABASE="$RESOLVED_PGDATABASE" PGPASSWORD="$RESOLVED_PGPASSWORD" \
    psql -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"

case "$TABLE_COUNT" in
  ''|*[!0-9]*)
    fail "failed to verify public schema table count after restore"
    ;;
esac

printf 'PostgreSQL restore completed successfully. Verified %s tables in public schema.\n' "$TABLE_COUNT"
