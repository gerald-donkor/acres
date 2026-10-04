#!/bin/sh
set -eu

usage() {
  printf 'Usage: scripts/ops/scan-secrets.sh [--cwd <path> | --cwd=<path>]\n'
}

fail() {
  printf 'secret scan failed: %s\n' "$1" >&2
  exit 1
}

TARGET_CWD="."
CWD_SPECIFIED=0

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

if ! (cd "$RESOLVED_CWD" && git rev-parse --is-inside-work-tree >/dev/null 2>&1); then
  fail "target directory is not a git repository: $TARGET_CWD"
fi

tmp="$(mktemp "${TMPDIR:-/tmp}/acres-secret-scan.XXXXXX" 2>/dev/null || printf '%s/acres-secret-scan.%s' "${TMPDIR:-/tmp}" "$$")"
trap 'rm -f "$tmp"' EXIT INT TERM HUP
: > "$tmp"

is_allowed_path() {
  case "$1" in
    .env.example|server/.env.example|infra/env/*|infra/launch/*|.github/workflows/ci.yml|docker-compose.yml|infra/garage/garage.toml|client/playwright.config.ts|server/src/config/env.validation.ts|server/src/contracts/generate-contracts.ts|docs/*|prompts/*|server/test/*|server/src/**/*.spec.ts|client/tests/*|scripts/ops/scan-secrets.sh|scripts/ops/check-launch-readiness.js|scripts/ops/check-launch-readiness.spec.js|scripts/ops/*.spec.js|scripts/ops/run-secret-rotation-drill.sh|scripts/ops/verify-volume-encryption.js)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

scan_pattern() {
  pattern="$1"
  label="$2"
  (
    cd "$RESOLVED_CWD"
    { git grep -n -I -E "$pattern" -- . \
      ':(exclude)package-lock.json' \
      ':(exclude).agents' \
      ':(exclude)node_modules' \
      ':(exclude).next' \
      ':(exclude)server/src/generated' 2>/dev/null || true; }
  ) | while IFS= read -r match; do
    [ -n "$match" ] || continue
    path="${match%%:*}"
    path="${path#./}"
    if ! is_allowed_path "$path"; then
      printf 'secret scan failed: %s in %s\n' "$label" "$match" >&2
      printf '1\n' >> "$tmp"
    fi
  done
}

scan_pattern 'acres_(superuser|migrator|app|test|valkey)_dev_password' 'local development password'
scan_pattern 'change-me(-|_|[A-Za-z0-9])' 'change-me placeholder'
scan_pattern '__REQUIRED_[A-Z0-9_]+__' 'launch placeholder sentinel'
scan_pattern 'NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|KEY)' 'client-exposed secret-looking name'

if [ -s "$tmp" ]; then
  exit 1
fi

printf 'secret/default scan passed\n'
