#!/usr/bin/env bash
set -euo pipefail
# Give each stage its own process group for catchable-interruption cleanup.
set -m

# scripts/ops/run-launch-drills.sh
#
# Unified Launch Drill Orchestrator for Acres (Phase 12K — Phase 12 exit gate).
# Bash (not POSIX sh): arrays and [[ ]] match the sibling drill runners.
# Executes the complete battery of operational drills end-to-end, validates
# every stage exit code, and aggregates a single machine-readable
# Unified Launch Evidence Dossier:
#   backups/launch-evidence-dossier-<timestamp>-<run-id>.json
#
# Safety: the secret-rotation child always runs with --dry-run (credential
# mutation must stay an explicit operator action), and reconciliation reporting
# stays --dry-run (read-only; it still requires live Postgres + Garage/S3),
# even in live mode.
#
# Stages:
#   1. static_templates        — production templates, docker runtime, secret scan
#   2. supply_chain_sast       — SBOM + licenses, SAST scan, container security
#   3. ingress_deployment      — Caddy routing verify + deployment drill
#   4. volume_encryption       — volume encryption + key separation verify
#   5. secret_rotation         — secret rotation drill (always --dry-run)
#   6. capacity_alerting       — capacity benchmark, DoS resilience, alert simulation
#   7. disaster_recovery       — restore drill + storage reconciliation

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
JSON_OUT=0
VERBOSE=0
EVIDENCE_DIR="backups"
OUTPUT_PATH=""
CADDYFILE="infra/caddy/Caddyfile.example"
COMPOSE_FILE="infra/compose/docker-compose.production.example.yml"
TARGET_URL=""
API_URL=""
DATABASE_TELEMETRY_FILE=""
ALLOW_HSTS=0

usage() {
  cat <<'EOF'
Usage: scripts/ops/run-launch-drills.sh [options]

Unified Launch Drill Orchestrator — runs all 7 operational drill stages and
emits a Unified Launch Evidence Dossier JSON report.

Options:
  --dry-run                Run child drills in offline dry-run mode (no live traffic).
                           Without it, drills run live against drill infra — except
                           secret rotation and reconciliation reporting, which stay
                           --dry-run by design (no credential mutation).
  --json                   Print the evidence dossier JSON to stdout on success
  --output <path>          Exact destination path for the dossier JSON file
  --evidence-dir <dir>     Directory for the dossier, stage logs, and child
                           evidence (default: backups)
  --verbose                Echo each child drill command before executing it
  --caddyfile <file>       Caddyfile to verify in both stage 3 children
  --compose-file <file>    Compose file for the deployment drill
  --target-url <url>      Live capacity benchmark target
  --api-url <url>         Live API target for DoS and readiness probes
  --database-telemetry-file <file>  Fresh live database telemetry JSON
  --allow-hsts            Verify active HSTS in the selected Caddyfile
  --help, -h               Show this help message
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --json)
      JSON_OUT=1
      shift
      ;;
    --output|--evidence-dir|--caddyfile|--compose-file|--target-url|--api-url|--database-telemetry-file)
      if [ $# -lt 2 ] || [ -z "$2" ] || [[ "$2" == -* ]]; then
        printf 'Error: %s requires a value\n' "$1" >&2
        usage >&2
        exit 1
      fi
      case "$1" in
        --output) OUTPUT_PATH="$2" ;;
        --evidence-dir) EVIDENCE_DIR="$2" ;;
        --caddyfile) CADDYFILE="$2" ;;
        --compose-file) COMPOSE_FILE="$2" ;;
        --target-url) TARGET_URL="$2" ;;
        --api-url) API_URL="$2" ;;
        --database-telemetry-file) DATABASE_TELEMETRY_FILE="$2" ;;
      esac
      shift 2
      ;;
    --allow-hsts)
      ALLOW_HSTS=1
      shift
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Error: Unknown option\n' >&2
      usage >&2
      exit 1
      ;;
  esac
done

node -e 'for (const value of process.argv.slice(1)) if (/[\x00-\x1f\x7f]/.test(value)) { console.error("Error: path contains control characters"); process.exit(1) }' \
  "$CADDYFILE" "$COMPOSE_FILE" "$EVIDENCE_DIR" "$OUTPUT_PATH" "$DATABASE_TELEMETRY_FILE" "$TARGET_URL" "$API_URL" || exit 1

if [ "$DRY_RUN" -eq 1 ] && { [ -n "$TARGET_URL" ] || [ -n "$API_URL" ] || [ -n "$DATABASE_TELEMETRY_FILE" ] || [ "$ALLOW_HSTS" -eq 1 ]; }; then
  echo 'Error: --dry-run conflicts with live target options' >&2; exit 1
fi
if [ -n "$TARGET_URL" ] || [ -n "$API_URL" ]; then
  if [ -z "$TARGET_URL" ] || [ -z "$API_URL" ]; then
    echo 'Error: --target-url and --api-url must be supplied together' >&2; exit 1
  fi
  node -e 'try { const {safeUrl}=require("./scripts/ops/launch-target-evidence"); safeUrl(process.argv[1]); const api=new URL(safeUrl(process.argv[2])); if(api.pathname!=="/") throw Error("API target must be an origin") } catch { console.error("Error: invalid live target"); process.exit(1) }' "$TARGET_URL" "$API_URL" || exit 1
fi
if [ -n "$DATABASE_TELEMETRY_FILE" ] && [ -z "$TARGET_URL" ]; then
  echo 'Error: database telemetry requires a live target' >&2; exit 1
fi

get_time_ms() {
  local ms
  ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$ms" =~ ^[0-9]+$ ]]; then
    echo "$ms"
  else
    echo "$(( $(date +%s) * 1000 ))"
  fi
}

umask 077
node -e 'require("./scripts/ops/assemble-launch-dossier").directory(process.argv[1], true)' "$EVIDENCE_DIR" 2>/dev/null || { echo 'Error: invalid evidence directory' >&2; exit 1; }
EVIDENCE_DIR="$(realpath "$EVIDENCE_DIR")"
START_MS="$(get_time_ms)"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
RUN_DIR="$(mktemp -d "${EVIDENCE_DIR}/launch-drill-run-XXXXXXXXXXXX")"
if [ -z "$OUTPUT_PATH" ]; then OUTPUT_PATH="${EVIDENCE_DIR}/launch-evidence-dossier-${STAMP}-${RUN_DIR##*/}.json"; fi
OUTPUT_PATH="$(node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$OUTPUT_PATH")"
CHILD_PID=""
cleanup() {
  if [ -n "$CHILD_PID" ]; then
    kill -TERM -- "-$CHILD_PID" 2>/dev/null || true
    # Bound cleanup even if a child ignores TERM. This group's PID is invocation-owned.
    for attempt in {1..20}; do
      if ! kill -0 -- "-$CHILD_PID" 2>/dev/null; then break; fi
      sleep 0.05
    done
    kill -KILL -- "-$CHILD_PID" 2>/dev/null || true
    wait "$CHILD_PID" 2>/dev/null || true
  fi
  node scripts/ops/assemble-launch-dossier.js release "$OUTPUT_PATH" "$RUN_DIR" >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
node scripts/ops/assemble-launch-dossier.js prepare "$OUTPUT_PATH" "$RUN_DIR" || exit 1
STAGE_IDS=()
STAGE_DESCS=()
STAGE_STATUS=()
STAGE_MS=()
STAGE_ERRORS=()
STAGE_ARTIFACTS=()
run_stage() {
  local stage_id="$1" stage_desc="$2"
  shift 2
  local start_ms end_ms elapsed_ms status err log_file
  STAGE_DIR="${RUN_DIR}/${stage_id}"
  mkdir "$STAGE_DIR"
  log_file="${STAGE_DIR}/launch-drill-stage-${stage_id}.log"
  if [ "$VERBOSE" -eq 1 ]; then printf '  Running stage %s\n' "$stage_id"; fi
  start_ms="$(get_time_ms)"
  status="PASSED"; err=""
  "$@" >"$log_file" 2>&1 &
  CHILD_PID=$!
  if ! wait "$CHILD_PID"; then status="FAILED"; err="child process failed; inspect private stage log"; fi
  CHILD_PID=""
  end_ms="$(get_time_ms)"
  elapsed_ms=$((end_ms - start_ms))
  if [ "$elapsed_ms" -lt 0 ]; then elapsed_ms=0; fi
  STAGE_IDS+=("$stage_id"); STAGE_DESCS+=("$stage_desc"); STAGE_STATUS+=("$status")
  STAGE_MS+=("$elapsed_ms"); STAGE_ERRORS+=("$err"); STAGE_ARTIFACTS+=("$log_file")
  printf '  DONE  %-20s %s (%d ms; receipt verification pending)\n' "$stage_id" "$stage_desc" "$elapsed_ms"
}

printf '%s\n' '================================================================='
printf 'Acres Unified Launch Drill Orchestrator (Phase 12K)'
printf '%s\n' '================================================================='
printf 'Mode:                 %s\n' "$([ "$DRY_RUN" -eq 1 ] && echo 'dry-run (offline)' || echo 'live')"
printf 'Dossier destination:  %s\n' "$OUTPUT_PATH"
printf 'Timestamp:            %s\n\n' "$TIMESTAMP"

child_dry=()
if [ "$DRY_RUN" -eq 1 ]; then child_dry=(--dry-run); fi
stage_supply_chain() {
  node scripts/ops/generate-sbom.js --verify-licenses --output "${STAGE_DIR}/sbom-inventory-receipt.json" &&
  node scripts/ops/run-sast-scan.js --output "${STAGE_DIR}/sast-scan-evidence-receipt.json" &&
  node scripts/ops/verify-container-security.js --output "${STAGE_DIR}/container-security-evidence-receipt.json"
}
stage_ingress() {
  local hsts=()
  if [ "$ALLOW_HSTS" -eq 1 ]; then hsts=(--allow-hsts); fi
  node scripts/ops/verify-caddy-routing.js "$CADDYFILE" "${hsts[@]}" --output "${STAGE_DIR}/caddy-routing-evidence-receipt.json" &&
  bash scripts/ops/run-deployment-drill.sh "${child_dry[@]}" "${hsts[@]}" --caddyfile "$CADDYFILE" --compose-file "$COMPOSE_FILE" --api-url "${API_URL:-http://localhost:3001}" --evidence-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/deployment-drill-evidence-receipt.json"
}
stage_disaster_recovery() {
  bash scripts/ops/run-restore-drill.sh "${child_dry[@]}" --backup-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/restore-drill-evidence-receipt.json" &&
  node scripts/ops/reconcile-storage-objects.js --dry-run --output "${STAGE_DIR}/reconcile-report-receipt.json"
}

stage_static() { node scripts/ops/run-static-integrity-checks.js --output "${STAGE_DIR}/static-integrity-evidence-receipt.json"; }
stage_volume() { node scripts/ops/verify-volume-encryption.js --output "${STAGE_DIR}/volume-encryption-evidence-receipt.json"; }
stage_rotation() { bash scripts/ops/run-secret-rotation-drill.sh --dry-run --evidence-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/secret-rotation-evidence-receipt.json"; }
stage_capacity() { bash scripts/ops/run-capacity-alerting-drill.sh "${capacity_args[@]}" --evidence-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/capacity-alerting-drill-evidence-receipt.json"; }

# Stage 1: static templates & container runtime integrity
run_stage "static_templates" "Templates, runtime, secret scan" \
  stage_static

# Stage 2: supply-chain SBOM & SAST security scanning
run_stage "supply_chain_sast" "SBOM, SAST, container security" \
  stage_supply_chain

# Stage 3: Caddy ingress routing & deployment rollback preflight
run_stage "ingress_deployment" "Caddy routing + deployment drill" \
  stage_ingress

# Stage 4: production volume encryption key separation
run_stage "volume_encryption" "Volume encryption + key separation" \
  stage_volume

# Stage 5: zero-downtime secret rotation & compromise drill.
# Always --dry-run: credential rotation stays an explicit operator action.
run_stage "secret_rotation" "Secret rotation drill" \
  stage_rotation

# Stage 6: capacity benchmarking, DoS resilience & alert simulation
capacity_args=("${child_dry[@]}")
if [ -z "$TARGET_URL" ] && [ "$DRY_RUN" -eq 0 ]; then
  capacity_args=(--dry-run)
fi
if [ -n "$TARGET_URL" ]; then capacity_args+=(--target-url "$TARGET_URL" --api-url "$API_URL"); fi
if [ -n "$DATABASE_TELEMETRY_FILE" ]; then capacity_args+=(--database-telemetry-file "$DATABASE_TELEMETRY_FILE"); fi
run_stage "capacity_alerting" "Capacity, DoS, alert simulation" \
  stage_capacity

# Stage 7: disaster recovery restore drill & reconciliation.
# Restore dry-run preflight and read-only reconciliation still require live drill
# infrastructure. Static integrity can also contact the dependency registry.
# The hermetic process tests stub these children; this runner does not.
run_stage "disaster_recovery" "Restore drill + reconciliation" \
  stage_disaster_recovery
END_MS="$(get_time_ms)"
DURATION_MS=$((END_MS - START_MS))
DURATION_S="$(node -e "console.log(($DURATION_MS/1000).toFixed(2))")"

TOTAL=${#STAGE_STATUS[@]}

node scripts/ops/assemble-launch-dossier.js assemble "$OUTPUT_PATH" "$TIMESTAMP" "$DURATION_S" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_IDS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_DESCS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_STATUS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1).map(Number)))' "${STAGE_MS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_ERRORS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_ARTIFACTS[@]}")" \
  "$CADDYFILE" "$COMPOSE_FILE" "$TARGET_URL" "$API_URL" "$ALLOW_HSTS" "$DRY_RUN" "$START_MS" "$END_MS" "$RUN_DIR" || exit 1

OVERALL="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).overall_status)' "$(realpath "$OUTPUT_PATH")")"
PASSED="$(node -e 'process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).passed_stages))' "$(realpath "$OUTPUT_PATH")")"
FAILED=$((TOTAL - PASSED))

printf '%s\n' '-----------------------------------------------------------------'
printf 'Stages passed: %d/%d  |  failed: %d  |  duration: %s s\n' "$PASSED" "$TOTAL" "$FAILED" "$DURATION_S"
printf 'Dossier: %s\n' "$OUTPUT_PATH"
printf '%s\n' '-----------------------------------------------------------------'

if [ "$JSON_OUT" -eq 1 ]; then
  cat "$OUTPUT_PATH"
fi

if [ "$OVERALL" = "PASSED" ]; then
  printf 'Overall Result: PASSED. All 7 drill stages satisfied. Operator production sign-off remains separate.\n\n'
  exit 0
else
  printf 'Overall Result: FAILED. %d stage(s) failed — see dossier.\n\n' "$FAILED"
  exit 1
fi
