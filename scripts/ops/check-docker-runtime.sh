#!/bin/sh
set -eu

dockerfile=server/Dockerfile

[ -f "$dockerfile" ] || {
  printf 'docker runtime check failed: missing %s\n' "$dockerfile" >&2
  exit 1
}

grep -Eq '^FROM node:24-alpine( AS |$)' "$dockerfile" || {
  printf 'docker runtime check failed: server image must use Node 24 Alpine stages\n' >&2
  exit 1
}

grep -Eq '^USER node$' "$dockerfile" || {
  printf 'docker runtime check failed: runtime image must run as USER node\n' >&2
  exit 1
}

grep -Eq '^HEALTHCHECK ' "$dockerfile" || {
  printf 'docker runtime check failed: server image must keep a HEALTHCHECK\n' >&2
  exit 1
}

grep -Fq 'CMD ["node", "server/dist/main.js"]' "$dockerfile" || {
  printf 'docker runtime check failed: server image must start Node directly, not npm\n' >&2
  exit 1
}

printf 'docker runtime check passed\n'
