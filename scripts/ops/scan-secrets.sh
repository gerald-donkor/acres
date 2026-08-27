#!/bin/sh
set -eu

tmp=${TMPDIR:-/tmp}/acres-secret-scan.$$
trap 'rm -f "$tmp"' EXIT
: > "$tmp"

is_allowed_path() {
  case "$1" in
    .env.example|server/.env.example|infra/env/*|infra/launch/*|.github/workflows/ci.yml|docker-compose.yml|infra/garage/garage.toml|client/playwright.config.ts|server/src/config/env.validation.ts|server/src/contracts/generate-contracts.ts|docs/*|prompts/*|server/test/*|server/src/**/*.spec.ts|client/tests/*|scripts/ops/scan-secrets.sh|scripts/ops/check-launch-readiness.js)
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
  git grep -n -I -E "$pattern" -- . \
    ':(exclude)package-lock.json' \
    ':(exclude).agents' \
    ':(exclude)node_modules' \
    ':(exclude).next' \
    ':(exclude)server/src/generated' |
  while IFS= read -r match; do
    path=${match%%:*}
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
