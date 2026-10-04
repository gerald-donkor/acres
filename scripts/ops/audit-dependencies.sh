#!/bin/sh
set -eu

usage() {
  printf 'Usage: scripts/ops/audit-dependencies.sh [--cwd <path> | --cwd=<path>] [--audit-level <level> | --audit-level=<level>] [--omit <type> | --omit=<type>]\n'
}

fail() {
  printf 'audit error: %s\n' "$1" >&2
  exit 1
}

TARGET_CWD="."
CWD_SPECIFIED=0
AUDIT_LEVEL="critical"
LEVEL_SPECIFIED=0
OMIT="dev"
OMIT_SPECIFIED=0

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
    --audit-level=*)
      if [ "$LEVEL_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --audit-level option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_LEVEL="${1#--audit-level=}"
      TRIMMED_LEVEL="$(printf '%s' "$RAW_LEVEL" | tr -d '[:space:]')"
      if [ -z "$RAW_LEVEL" ] || [ -z "$TRIMMED_LEVEL" ]; then
        printf 'Error: --audit-level cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      AUDIT_LEVEL="$RAW_LEVEL"
      LEVEL_SPECIFIED=1
      shift
      ;;
    --audit-level)
      if [ "$LEVEL_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --audit-level option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --audit-level requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_LEVEL="$2"
      case "$RAW_LEVEL" in
        -*)
          printf 'Error: --audit-level requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_LEVEL="$(printf '%s' "$RAW_LEVEL" | tr -d '[:space:]')"
      if [ -z "$RAW_LEVEL" ] || [ -z "$TRIMMED_LEVEL" ]; then
        printf 'Error: --audit-level cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      AUDIT_LEVEL="$RAW_LEVEL"
      LEVEL_SPECIFIED=1
      shift 2
      ;;
    --omit=*)
      if [ "$OMIT_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --omit option\n' >&2
        usage >&2
        exit 1
      fi
      RAW_OMIT="${1#--omit=}"
      TRIMMED_OMIT="$(printf '%s' "$RAW_OMIT" | tr -d '[:space:]')"
      if [ -z "$RAW_OMIT" ] || [ -z "$TRIMMED_OMIT" ]; then
        printf 'Error: --omit cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      OMIT="$RAW_OMIT"
      OMIT_SPECIFIED=1
      shift
      ;;
    --omit)
      if [ "$OMIT_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --omit option\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --omit requires a value\n' >&2
        usage >&2
        exit 1
      fi
      RAW_OMIT="$2"
      case "$RAW_OMIT" in
        -*)
          printf 'Error: --omit requires a value\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_OMIT="$(printf '%s' "$RAW_OMIT" | tr -d '[:space:]')"
      if [ -z "$RAW_OMIT" ] || [ -z "$TRIMMED_OMIT" ]; then
        printf 'Error: --omit cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      OMIT="$RAW_OMIT"
      OMIT_SPECIFIED=1
      shift 2
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

case "$AUDIT_LEVEL" in
  info|low|moderate|high|critical)
    ;;
  *)
    printf 'Error: Invalid --audit-level "%s" (allowed: info, low, moderate, high, critical)\n' "$AUDIT_LEVEL" >&2
    usage >&2
    exit 1
    ;;
esac

if [ ! -d "$TARGET_CWD" ]; then
  fail "target directory does not exist: $TARGET_CWD"
fi

RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"

if [ ! -f "$RESOLVED_CWD/package.json" ]; then
  fail "target directory does not contain package.json: $TARGET_CWD"
fi

if [ ! -f "$RESOLVED_CWD/package-lock.json" ]; then
  fail "target directory does not contain package-lock.json: $TARGET_CWD"
fi

printf 'Running production dependency security audit (level: %s, omit: %s)...\n' "$AUDIT_LEVEL" "$OMIT"

if ! (cd "$RESOLVED_CWD" && npm audit --omit="$OMIT" --audit-level="$AUDIT_LEVEL"); then
  fail "$AUDIT_LEVEL vulnerabilities detected in production dependencies"
fi

printf 'Production dependency security audit passed (0 %s vulnerabilities)\n' "$AUDIT_LEVEL"
