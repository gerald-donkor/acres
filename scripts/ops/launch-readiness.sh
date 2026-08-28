#!/bin/sh
set -eu

READINESS_FILE="${1:-infra/launch/readiness.example.json}"

scripts/ops/check-production-templates.sh
scripts/ops/scan-secrets.sh
scripts/ops/check-docker-runtime.sh
node --test scripts/ops/check-launch-readiness.spec.js

node scripts/ops/check-launch-readiness.js "$READINESS_FILE"
