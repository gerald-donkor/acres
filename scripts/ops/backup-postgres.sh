#!/bin/sh
set -eu

usage() {
  printf 'Usage: scripts/ops/backup-postgres.sh [--cwd <path> | --cwd=<path>] [--backup-dir <dir> | --backup-dir=<dir>] [--host <host> | --host=<host>] [--port <port> | --port=<port>] [--user <user> | --user=<user>] [--dbname <db> | --dbname=<db>] [--output-file <file> | --output-file=<file>] [--dry-run]\n'
}

fail() {
  printf 'backup error: %s\n' "$1" >&2
  exit 1
}

TARGET_CWD="."
CWD_SPECIFIED=0

BACKUP_DIR_VAL=""
BACKUP_DIR_SPECIFIED=0

HOST_VAL=""
HOST_SPECIFIED=0

PORT_VAL=""
PORT_SPECIFIED=0

USER_VAL=""
USER_SPECIFIED=0

DBNAME_VAL=""
DBNAME_SPECIFIED=0

OUTPUT_FILE_VAL=""
OUTPUT_FILE_SPECIFIED=0

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
    --backup-dir=*)
      if [ "$BACKUP_DIR_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --backup-dir option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_DIR="${1#--backup-dir=}"
      TRIMMED_DIR="$(printf '%s' "$RAW_DIR" | tr -d '[:space:]')"
      if [ -z "$RAW_DIR" ] || [ -z "$TRIMMED_DIR" ]; then
        printf 'Error: --backup-dir cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      BACKUP_DIR_VAL="$RAW_DIR"
      BACKUP_DIR_SPECIFIED=1
      shift
      ;;
    --backup-dir)
      if [ "$BACKUP_DIR_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --backup-dir option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --backup-dir requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_DIR="$2"
      case "$RAW_DIR" in
        -*)
          printf 'Error: --backup-dir requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_DIR="$(printf '%s' "$RAW_DIR" | tr -d '[:space:]')"
      if [ -z "$RAW_DIR" ] || [ -z "$TRIMMED_DIR" ]; then
        printf 'Error: --backup-dir cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      BACKUP_DIR_VAL="$RAW_DIR"
      BACKUP_DIR_SPECIFIED=1
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
        ''|*[!0-9]*)
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
        ''|*[!0-9]*)
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
    --output-file=*)
      if [ "$OUTPUT_FILE_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --output-file option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_OUT="${1#--output-file=}"
      TRIMMED_OUT="$(printf '%s' "$RAW_OUT" | tr -d '[:space:]')"
      if [ -z "$RAW_OUT" ] || [ -z "$TRIMMED_OUT" ]; then
        printf 'Error: --output-file cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      OUTPUT_FILE_VAL="$RAW_OUT"
      OUTPUT_FILE_SPECIFIED=1
      shift
      ;;
    --output-file)
      if [ "$OUTPUT_FILE_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --output-file option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --output-file requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_OUT="$2"
      case "$RAW_OUT" in
        -*)
          printf 'Error: --output-file requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_OUT="$(printf '%s' "$RAW_OUT" | tr -d '[:space:]')"
      if [ -z "$RAW_OUT" ] || [ -z "$TRIMMED_OUT" ]; then
        printf 'Error: --output-file cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      OUTPUT_FILE_VAL="$RAW_OUT"
      OUTPUT_FILE_SPECIFIED=1
      shift 2
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
      printf 'Error: Unexpected argument "%s"\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ ! -d "$TARGET_CWD" ]; then
  fail "target directory does not exist: $TARGET_CWD"
fi

RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"

# Verify pg_dump exists in PATH
command -v pg_dump >/dev/null 2>&1 || fail "pg_dump utility not found in PATH"

# Resolve credentials
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
  ''|*[!0-9]*)
    fail "invalid port: $RESOLVED_PGPORT (expected integer 1-65535)"
    ;;
esac
if [ "$RESOLVED_PGPORT" -lt 1 ] || [ "$RESOLVED_PGPORT" -gt 65535 ]; then
  fail "invalid port: $RESOLVED_PGPORT (expected integer 1-65535)"
fi

# Resolve output paths and create directory
if [ "$OUTPUT_FILE_SPECIFIED" -eq 1 ]; then
  case "$OUTPUT_FILE_VAL" in
    /*) RESOLVED_OUTPUT_FILE="$OUTPUT_FILE_VAL" ;;
    *) RESOLVED_OUTPUT_FILE="$RESOLVED_CWD/$OUTPUT_FILE_VAL" ;;
  esac
  OUTPUT_DIR="$(dirname "$RESOLVED_OUTPUT_FILE")"
  if [ ! -d "$OUTPUT_DIR" ]; then
    mkdir -p "$OUTPUT_DIR"
    chmod 700 "$OUTPUT_DIR"
  fi
else
  DEFAULT_DIR="${BACKUP_DIR_VAL:-${BACKUP_DIR:-backups}}"
  case "$DEFAULT_DIR" in
    /*) RESOLVED_BACKUP_DIR="$DEFAULT_DIR" ;;
    *) RESOLVED_BACKUP_DIR="$RESOLVED_CWD/$DEFAULT_DIR" ;;
  esac
  TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
  RESOLVED_OUTPUT_FILE="${RESOLVED_BACKUP_DIR}/acres-db-${TIMESTAMP}.dump"
  OUTPUT_DIR="$RESOLVED_BACKUP_DIR"
  mkdir -p "$OUTPUT_DIR"
  chmod 700 "$OUTPUT_DIR"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[dry-run] PostgreSQL backup plan:\n'
  printf '[dry-run]   Host: %s\n' "$RESOLVED_PGHOST"
  printf '[dry-run]   Port: %s\n' "$RESOLVED_PGPORT"
  printf '[dry-run]   User: %s\n' "$RESOLVED_PGUSER"
  printf '[dry-run]   Database: %s\n' "$RESOLVED_PGDATABASE"
  printf '[dry-run]   Output file: %s\n' "$RESOLVED_OUTPUT_FILE"
  printf '[dry-run] Dry run completed successfully.\n'
  exit 0
fi

printf 'Starting PostgreSQL backup for database "%s" on %s:%s...\n' "$RESOLVED_PGDATABASE" "$RESOLVED_PGHOST" "$RESOLVED_PGPORT"

# Run pg_dump in custom archive format (-Fc)
PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGDATABASE="$RESOLVED_PGDATABASE" PGPASSWORD="$RESOLVED_PGPASSWORD" \
  pg_dump --format=custom --no-owner --no-privileges --file="$RESOLVED_OUTPUT_FILE"

if [ ! -s "$RESOLVED_OUTPUT_FILE" ]; then
  rm -f "$RESOLVED_OUTPUT_FILE"
  fail "generated backup file is empty or missing: $RESOLVED_OUTPUT_FILE"
fi

chmod 600 "$RESOLVED_OUTPUT_FILE"
FILE_BYTES="$(wc -c < "$RESOLVED_OUTPUT_FILE" | tr -d ' ')"

printf 'PostgreSQL backup completed successfully: %s (%s bytes)\n' "$RESOLVED_OUTPUT_FILE" "$FILE_BYTES"
