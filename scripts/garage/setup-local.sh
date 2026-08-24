#!/usr/bin/env bash
set -euo pipefail

bucket="${STORAGE_BUCKET:-acres-quarantine}"
key_name="${GARAGE_KEY_NAME:-acres-local-api}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to initialize local Garage" >&2
  exit 1
fi

docker compose up -d garage

echo "Creating local Garage bucket '${bucket}' if needed..."
docker compose exec -T garage garage bucket info "${bucket}" >/dev/null 2>&1 \
  || docker compose exec -T garage garage bucket create "${bucket}"

echo "Creating local Garage key '${key_name}'..."
key_output="$(docker compose exec -T garage garage key create "${key_name}")"
printf '%s\n' "${key_output}"

access_key="$(printf '%s\n' "${key_output}" | awk -F: '/Key ID/ { gsub(/^[ \t]+/, "", $2); print $2; exit }')"

if [ -z "${access_key}" ]; then
  echo "Could not parse Garage access key from CLI output" >&2
  exit 1
fi

docker compose exec -T garage garage bucket allow --key "${access_key}" --read --write "${bucket}"

cat <<EOF

Set these in server/.env:

STORAGE_BUCKET=${bucket}
STORAGE_ACCESS_KEY_ID=${access_key}
STORAGE_SECRET_ACCESS_KEY=<copy the Secret key printed above>

The secret is printed by Garage at creation time; do not commit it.
EOF
