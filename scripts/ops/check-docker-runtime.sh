#!/bin/sh
set -eu

usage() {
  printf 'Usage: scripts/ops/check-docker-runtime.sh [--cwd <path> | --cwd=<path>] [--dockerfile <path> | --dockerfile=<path>]\n'
}

fail() {
  printf 'docker runtime check failed: %s\n' "$1" >&2
  exit 1
}

TARGET_CWD="."
CWD_SPECIFIED=0
CUSTOM_DOCKERFILE=""
DOCKERFILE_SPECIFIED=0

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
    --dockerfile=*)
      if [ "$DOCKERFILE_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --dockerfile option; expected single file path\n' >&2
        usage >&2
        exit 1
      fi
      RAW_DOCKERFILE="${1#--dockerfile=}"
      TRIMMED_DOCKERFILE="$(printf '%s' "$RAW_DOCKERFILE" | tr -d '[:space:]')"
      if [ -z "$RAW_DOCKERFILE" ] || [ -z "$TRIMMED_DOCKERFILE" ]; then
        printf 'Error: --dockerfile path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      CUSTOM_DOCKERFILE="$RAW_DOCKERFILE"
      DOCKERFILE_SPECIFIED=1
      shift
      ;;
    --dockerfile)
      if [ "$DOCKERFILE_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --dockerfile option; expected single file path\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --dockerfile requires a non-empty file path\n' >&2
        usage >&2
        exit 1
      fi
      RAW_DOCKERFILE="$2"
      case "$RAW_DOCKERFILE" in
        -*)
          printf 'Error: --dockerfile requires a non-empty file path\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_DOCKERFILE="$(printf '%s' "$RAW_DOCKERFILE" | tr -d '[:space:]')"
      if [ -z "$RAW_DOCKERFILE" ] || [ -z "$TRIMMED_DOCKERFILE" ]; then
        printf 'Error: --dockerfile path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      CUSTOM_DOCKERFILE="$RAW_DOCKERFILE"
      DOCKERFILE_SPECIFIED=1
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

if [ ! -d "$TARGET_CWD" ]; then
  fail "target directory does not exist: $TARGET_CWD"
fi

RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"

if [ -n "$CUSTOM_DOCKERFILE" ]; then
  case "$CUSTOM_DOCKERFILE" in
    /*)
      DOCKERFILE="$CUSTOM_DOCKERFILE"
      ;;
    *)
      DOCKERFILE="$RESOLVED_CWD/$CUSTOM_DOCKERFILE"
      ;;
  esac
  DOCKERFILE_DISPLAY="$CUSTOM_DOCKERFILE"
else
  DOCKERFILE="$RESOLVED_CWD/server/Dockerfile"
  DOCKERFILE_DISPLAY="server/Dockerfile"
fi

[ -f "$DOCKERFILE" ] || {
  fail "missing $DOCKERFILE_DISPLAY"
}

grep -Eq '^FROM node:24-alpine( AS |$)' "$DOCKERFILE" || {
  fail 'server image must use Node 24 Alpine stages'
}

grep -Eq '^USER node$' "$DOCKERFILE" || {
  fail 'runtime image must run as USER node'
}

grep -Eq '^HEALTHCHECK ' "$DOCKERFILE" || {
  fail 'server image must keep a HEALTHCHECK'
}

grep -Fq 'CMD ["node", "server/dist/main.js"]' "$DOCKERFILE" || {
  fail 'server image must start Node directly, not npm'
}

printf 'docker runtime check passed\n'
