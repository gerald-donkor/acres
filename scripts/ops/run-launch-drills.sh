#!/usr/bin/env bash
set -euo pipefail

# scripts/ops/run-launch-drills.sh
#
# Unified Launch Drill Orchestrator for Acres (Phase 12K — Phase 12 exit gate).
# Bash (not POSIX sh): arrays and [[ ]] match the sibling drill runners.
# Executes the complete battery of operational drills end-to-end, validates
# every stage exit code, and aggregates a single machine-readable
# Unified Launch Evidence Dossier:
#   backups/launch-evidence-dossier-<timestamp>.json
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
    --output)
      if [ $# -lt 2 ]; then
        printf 'Error: --output requires a value\n' >&2
        usage >&2
        exit 1
      fi
      OUTPUT_PATH="$2"
      shift 2
      ;;
    --evidence-dir)
      if [ $# -lt 2 ]; then
        printf 'Error: --evidence-dir requires a value\n' >&2
        usage >&2
        exit 1
      fi
      EVIDENCE_DIR="$2"
      shift 2
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
      printf 'Error: Unknown option "%s"\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

get_time_ms() {
  local ms
  ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$ms" =~ ^[0-9]+$ ]]; then
    echo "$ms"
  else
    echo "$(( $(date +%s) * 1000 ))"
  fi
}

START_MS="$(get_time_ms)"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
mkdir -p "$EVIDENCE_DIR"

if [ -z "$OUTPUT_PATH" ]; then
  OUTPUT_PATH="${EVIDENCE_DIR}/launch-evidence-dossier-${STAMP}.json"
fi
mkdir -p "$(dirname "$OUTPUT_PATH")"

ENVIRONMENT="drill"
if [ "$DRY_RUN" -eq 0 ]; then
  ENVIRONMENT="production"
fi

STAGE_IDS=()
STAGE_DESCS=()
STAGE_STATUS=()
STAGE_MS=()
STAGE_ERRORS=()
STAGE_ARTIFACTS=()

record_stage() {
  STAGE_IDS+=("$1")
  STAGE_DESCS+=("$2")
  STAGE_STATUS+=("$3")
  STAGE_MS+=("$4")
  STAGE_ERRORS+=("$5")
  STAGE_ARTIFACTS+=("$6")
}

run_stage() {
  local stage_id="$1"
  local stage_desc="$2"
  shift 2
  local start_ms end_ms elapsed_ms status err log_file snap_before snap_after new_files artifacts
  log_file="${EVIDENCE_DIR}/launch-drill-stage-${stage_id}.log"
  if [ "$VERBOSE" -eq 1 ]; then
    printf '  $ %s\n' "$*"
  fi
  snap_before="$(mktemp)"
  ls -1 "$EVIDENCE_DIR" 2>/dev/null | sort >"$snap_before"
  start_ms="$(get_time_ms)"
  status="PASSED"
  err=""
  # Execute the stage body supplied via remaining args as a bash -c string.
  if ! bash -c "$*" >"$log_file" 2>&1; then
    status="FAILED"
    err="stage '${stage_id}' reported failure (see ${log_file})"
  fi
  end_ms="$(get_time_ms)"
  elapsed_ms=$((end_ms - start_ms))
  # Discover child evidence files the stage emitted (excluding our own log).
  snap_after="$(mktemp)"
  ls -1 "$EVIDENCE_DIR" 2>/dev/null | sort >"$snap_after"
  new_files="$(comm -13 "$snap_before" "$snap_after" | grep -v -x "launch-drill-stage-${stage_id}.log" || true)"
  rm -f "$snap_before" "$snap_after"
  artifacts="$log_file"
  if [ -n "$new_files" ]; then
    while IFS= read -r f; do
      artifacts="${artifacts}
${EVIDENCE_DIR}/${f}"
    done <<<"$new_files"
  fi
  record_stage "$stage_id" "$stage_desc" "$status" "$elapsed_ms" "$err" "$artifacts"
  if [ "$status" = "PASSED" ]; then
    printf '  PASS  %-20s %s (%d ms)\n' "$stage_id" "$stage_desc" "$elapsed_ms"
  else
    printf '  FAIL  %-20s %s (%d ms)\n' "$stage_id" "$stage_desc" "$elapsed_ms"
  fi
}

printf '%s\n' '================================================================='
printf 'Acres Unified Launch Drill Orchestrator (Phase 12K)'
printf '%s\n' '================================================================='
printf 'Mode:                 %s\n' "$([ "$DRY_RUN" -eq 1 ] && echo 'dry-run (offline)' || echo 'live')"
printf 'Dossier destination:  %s\n' "$OUTPUT_PATH"
printf 'Timestamp:            %s\n\n' "$TIMESTAMP"

CHILD_DRY=""
if [ "$DRY_RUN" -eq 1 ]; then
  CHILD_DRY="--dry-run"
fi

# Stage 1: static templates & container runtime integrity
run_stage "static_templates" "Templates, runtime, secret scan" \
  "bash scripts/ops/check-production-templates.sh && bash scripts/ops/check-docker-runtime.sh && bash scripts/ops/scan-secrets.sh"

# Stage 2: supply-chain SBOM & SAST security scanning
run_stage "supply_chain_sast" "SBOM, SAST, container security" \
  "node scripts/ops/generate-sbom.js --verify-licenses && node scripts/ops/run-sast-scan.js && node scripts/ops/verify-container-security.js"

# Stage 3: Caddy ingress routing & deployment rollback preflight
run_stage "ingress_deployment" "Caddy routing + deployment drill" \
  "node scripts/ops/verify-caddy-routing.js && bash scripts/ops/run-deployment-drill.sh ${CHILD_DRY} --evidence-dir \"${EVIDENCE_DIR}\""

# Stage 4: production volume encryption key separation
run_stage "volume_encryption" "Volume encryption + key separation" \
  "node scripts/ops/verify-volume-encryption.js"

# Stage 5: zero-downtime secret rotation & compromise drill.
# Always --dry-run: credential rotation stays an explicit operator action.
run_stage "secret_rotation" "Secret rotation drill" \
  "bash scripts/ops/run-secret-rotation-drill.sh --dry-run --evidence-dir \"${EVIDENCE_DIR}\""

# Stage 6: capacity benchmarking, DoS resilience & alert simulation
run_stage "capacity_alerting" "Capacity, DoS, alert simulation" \
  "bash scripts/ops/run-capacity-alerting-drill.sh ${CHILD_DRY} --evidence-dir \"${EVIDENCE_DIR}\""

# Stage 7: disaster recovery restore drill & reconciliation.
# NOTE (judgement, verified against the repo): unlike stages 1–6, neither
# run-restore-drill.sh --dry-run (requires PGPASSWORD + pg_isready) nor
# reconcile-storage-objects.js --dry-run (requires authenticated Postgres AND
# reachable Garage/S3) is fully offline. The stage always attempts the real
# sub-drills and fails closed when drill infra is absent.
run_stage "disaster_recovery" "Restore drill + reconciliation" \
  "bash scripts/ops/run-restore-drill.sh ${CHILD_DRY} --backup-dir \"${EVIDENCE_DIR}\" --evidence-file \"${EVIDENCE_DIR}/restore-drill-evidence-${STAMP}.json\" && node scripts/ops/reconcile-storage-objects.js --dry-run --output \"${EVIDENCE_DIR}/reconcile-report-${STAMP}.json\""
if [ "${STAGE_STATUS[6]}" = "FAILED" ]; then
  STAGE_ERRORS[6]="restore/reconcile drill failed (requires PGPASSWORD, reachable Postgres and Garage/S3; see docs/launch-checklist.md disaster-recovery section; stage log: ${EVIDENCE_DIR}/launch-drill-stage-disaster_recovery.log)"
fi

END_MS="$(get_time_ms)"
DURATION_MS=$((END_MS - START_MS))
DURATION_S="$(node -e "console.log(($DURATION_MS/1000).toFixed(2))")"

PASSED=0
FAILED=0
for s in "${STAGE_STATUS[@]}"; do
  if [ "$s" = "PASSED" ]; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
  fi
done
TOTAL=${#STAGE_STATUS[@]}

OVERALL="PASSED"
if [ "$FAILED" -gt 0 ]; then
  OVERALL="FAILED"
fi

node -e '
const fs = require("fs");
const [outputPath, version, timestamp, environment, overall, total, passed, failed, durationS, durationMs, idsRaw, descsRaw, statusesRaw, msRaw, errsRaw, artsRaw] = process.argv.slice(1);
const ids = JSON.parse(idsRaw);
const descs = JSON.parse(descsRaw);
const statuses = JSON.parse(statusesRaw);
const ms = JSON.parse(msRaw);
const errs = JSON.parse(errsRaw);
const arts = JSON.parse(artsRaw);
const stages = ids.map((id, i) => ({
  stage_id: id,
  description: descs[i],
  status: statuses[i],
  duration_ms: ms[i],
  // Newline-joined by the orchestrator; the dossier itself closes the trail.
  artifacts: [...(arts[i] === "" ? [] : arts[i].split("\n")), outputPath],
  error_message: errs[i] === "" ? null : errs[i],
}));
const dossier = {
  version,
  timestamp,
  environment,
  overall_status: overall,
  total_stages: Number(total),
  passed_stages: Number(passed),
  failed_stages: Number(failed),
  duration_seconds: Number(durationS),
  stages,
  summary: {
    staticIntegrity: statuses[0] === "PASSED" ? "passed" : "failed",
    supplyChainSecurity: statuses[1] === "PASSED" ? "passed" : "failed",
    ingressDeployment: statuses[2] === "PASSED" ? "passed" : "failed",
    volumeEncryption: statuses[3] === "PASSED" ? "passed" : "failed",
    secretRotation: statuses[4] === "PASSED" ? "passed" : "failed",
    capacityAlerting: statuses[5] === "PASSED" ? "passed" : "failed",
    disasterRecovery: statuses[6] === "PASSED" ? "passed" : "failed",
    sloCompliance: statuses[5] === "PASSED" ? "capacity_alerts_verified" : "capacity_alerts_failed",
    recoveryCompliance: statuses[6] === "PASSED" ? "restore_reconcile_verified" : "restore_reconcile_failed",
    noAiPosture: "preview_excluded_from_launch",
  },
};
fs.writeFileSync(outputPath, JSON.stringify(dossier, null, 2) + "\n", "utf8");
' "$OUTPUT_PATH" "1.0.0" "$TIMESTAMP" "$ENVIRONMENT" "$OVERALL" "$TOTAL" "$PASSED" "$FAILED" "$DURATION_S" "$DURATION_MS" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_IDS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_DESCS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_STATUS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1).map(Number)))' "${STAGE_MS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_ERRORS[@]}")" \
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_ARTIFACTS[@]}")"

printf '%s\n' '-----------------------------------------------------------------'
printf 'Stages passed: %d/%d  |  failed: %d  |  duration: %s s\n' "$PASSED" "$TOTAL" "$FAILED" "$DURATION_S"
printf 'Dossier: %s\n' "$OUTPUT_PATH"
printf '%s\n' '-----------------------------------------------------------------'

if [ "$JSON_OUT" -eq 1 ]; then
  cat "$OUTPUT_PATH"
fi

if [ "$OVERALL" = "PASSED" ]; then
  printf 'Overall Result: PASSED. All 7 launch drill stages satisfied.\n\n'
  exit 0
else
  printf 'Overall Result: FAILED. %d stage(s) failed — see dossier.\n\n' "$FAILED"
  exit 1
fi
