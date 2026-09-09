#!/bin/sh
set -eu

READINESS_FILE="infra/launch/readiness.example.json"
WITH_DRILLS=0

while [ $# -gt 0 ]; do
  case "$1" in
    --with-drills)
      WITH_DRILLS=1
      shift
      ;;
    --help|-h)
      printf 'Usage: scripts/ops/launch-readiness.sh [--with-drills] [readiness.json]\n'
      exit 0
      ;;
    --*)
      printf 'Error: Unknown option "%s"\n' "$1" >&2
      exit 1
      ;;
    *)
      READINESS_FILE="$1"
      shift
      ;;
  esac
done

scripts/ops/check-production-templates.sh
scripts/ops/scan-secrets.sh
scripts/ops/check-docker-runtime.sh
node --test scripts/ops/check-launch-readiness.spec.js

if [ "$WITH_DRILLS" -eq 1 ]; then
  scripts/ops/run-launch-drills.sh --dry-run || {
    printf 'launch-readiness: unified drills failed; see the dossier at backups/launch-evidence-dossier-*.json\n' >&2
    exit 1
  }
fi

node scripts/ops/check-launch-readiness.js "$READINESS_FILE"
