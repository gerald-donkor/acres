#!/bin/sh
set -eu

printf 'Running production dependency security audit...\n'

# Verify zero critical security vulnerabilities in production dependencies
if ! npm audit --omit=dev --audit-level=critical; then
  printf 'audit error: critical vulnerabilities detected in production dependencies\n' >&2
  exit 1
fi

printf 'Production dependency security audit passed (0 critical vulnerabilities)\n'
