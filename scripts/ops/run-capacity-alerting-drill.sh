#!/usr/bin/env bash
set -euo pipefail

# scripts/ops/run-capacity-alerting-drill.sh
#
# Automated Capacity, Load Resilience, and Prometheus Alert Simulation Drill (TM-05, TM-16, TM-20).
#
# Top-level drill orchestrator executing:
# 1. Prometheus Alerting Rule Verification & Time-Series Simulation (7 rules);
# 2. Capacity & Latency SLO Evaluation (Availability >= 99.9%, p95 <= 500ms, Throughput >= 100 RPS);
# 3. Multi-Layer DoS Resilience & Rate Limiting Drill (Caddy, Throttler, GraphQL, Storage, Bcrypt);
# 4. Unified Audit Evidence Generation (backups/capacity-alerting-drill-evidence-<timestamp>.json).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
EVIDENCE_DIR="backups"
EVIDENCE_FILE=""
TARGET_URL=""
API_URL="${API_URL:-http://localhost:3001}"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --target-url)
      TARGET_URL="$2"
      shift 2
      ;;
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --evidence-dir)
      EVIDENCE_DIR="$2"
      shift 2
      ;;
    --evidence-file)
      EVIDENCE_FILE="$2"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/ops/run-capacity-alerting-drill.sh [options]

Automated Capacity, Load Resilience, and Prometheus Alert Simulation Drill (TM-05, TM-16, TM-20).

Options:
  --dry-run                  Run offline synthetic drills without live HTTP traffic
  --target-url <url>         Live HTTP target for capacity benchmark (default: synthetic simulation)
  --api-url <url>            URL to target API instance for DoS drill (default: http://localhost:3001)
  --evidence-dir <dir>       Directory for JSON drill evidence (default: backups)
  --evidence-file <file>     Exact destination path for JSON evidence file
  --help, -h                 Show this help message
EOF
      exit 0
      ;;
    *)
      printf 'Error: Unknown option "%s"\n' "$1" >&2
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

START_TIME_MS="$(get_time_ms)"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
mkdir -p "$EVIDENCE_DIR"

if [ -z "$EVIDENCE_FILE" ]; then
  EVIDENCE_FILE="${EVIDENCE_DIR}/capacity-alerting-drill-evidence-${TIMESTAMP}.json"
fi
mkdir -p "$(dirname "$EVIDENCE_FILE")"

DRILL_STATUS="success"
FAILURES=()

printf '=================================================================\n'
printf 'Acres Capacity, Load Resilience & Alert Simulation Drill\n'
printf '=================================================================\n\n'
printf 'Evidence destination: %s\n' "$EVIDENCE_FILE"
printf 'Timestamp:            %s\n\n' "$TIMESTAMP"

# -----------------------------------------------------------------------------
# Step 1: Prometheus Alert Rules Verification & Simulation
# -----------------------------------------------------------------------------
printf '%s\n' '--- [Step 1/3] Prometheus Alert Rules Verification & Simulation ---'
ALERT_OUTPUT_JSON=""
if ALERT_OUTPUT_JSON="$(node scripts/ops/verify-alert-rules.js --json)"; then
  printf '  ✓ Prometheus alert rules verified (7/7 rules valid and simulated)\n'
else
  printf '  ✗ Prometheus alert rule verification failed\n'
  DRILL_STATUS="failed"
  FAILURES+=("Prometheus alert rule verification failed")
fi

# -----------------------------------------------------------------------------
# Step 2: Capacity & Latency Evaluation (SLO Targets)
# -----------------------------------------------------------------------------
printf '\n--- [Step 2/3] Capacity, Load & Latency SLO Evaluation ---\n'
CAPACITY_ARGS=(--json)
if [ -n "$TARGET_URL" ] && [ "$DRY_RUN" -eq 0 ]; then
  CAPACITY_ARGS+=(--target-url "$TARGET_URL")
else
  CAPACITY_ARGS+=(--synthetic)
fi

CAPACITY_OUTPUT_JSON=""
if CAPACITY_OUTPUT_JSON="$(node scripts/ops/verify-capacity-load.js "${CAPACITY_ARGS[@]}")"; then
  printf '  ✓ Capacity & latency targets satisfied (SLO Category 5 compliant)\n'
else
  printf '  ✗ Capacity & latency SLO evaluation breached targets\n'
  DRILL_STATUS="failed"
  FAILURES+=("Capacity & latency evaluation failed SLO targets")
fi

# -----------------------------------------------------------------------------
# Step 3: Multi-Layer DoS & Rate Limiting Drill
# -----------------------------------------------------------------------------
printf '\n--- [Step 3/3] Multi-Layer DoS & Rate Limiting Resilience Drill ---\n'
DOS_EVIDENCE_TMP="${EVIDENCE_DIR}/dos-tmp-${TIMESTAMP}.json"
DOS_ARGS=(--evidence-file "$DOS_EVIDENCE_TMP" --api-url "$API_URL")
if [ "$DRY_RUN" -eq 1 ]; then
  DOS_ARGS+=(--dry-run)
fi

if bash scripts/ops/run-dos-resilience-drill.sh "${DOS_ARGS[@]}" >/dev/null 2>&1; then
  printf '  ✓ Multi-layer DoS resilience verified across all 5 defense boundaries\n'
else
  printf '  ✗ DoS resilience drill encountered violations\n'
  DRILL_STATUS="failed"
  FAILURES+=("DoS resilience drill failed")
fi

END_TIME_MS="$(get_time_ms)"
DURATION_MS=$((END_TIME_MS - START_TIME_MS))

FAILURES_JSON="[]"
if [ ${#FAILURES[@]} -gt 0 ]; then
  FAILURES_JSON="$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${FAILURES[@]}")"
fi

node -e '
const fs = require("fs");
const timestamp = process.argv[1];
const durationMs = parseInt(process.argv[2], 10);
const drillStatus = process.argv[3];
const alertRaw = process.argv[4];
const capacityRaw = process.argv[5];
const dosEvidencePath = process.argv[6];
const failures = JSON.parse(process.argv[7]);
const evidenceFile = process.argv[8];

let alertData = {};
try { alertData = JSON.parse(alertRaw); } catch {}

let capacityData = {};
try { capacityData = JSON.parse(capacityRaw); } catch {}

let dosData = {};
try {
  if (fs.existsSync(dosEvidencePath)) {
    dosData = JSON.parse(fs.readFileSync(dosEvidencePath, "utf8"));
    fs.unlinkSync(dosEvidencePath);
  }
} catch {}

const unifiedEvidence = {
  timestamp,
  durationMs,
  status: drillStatus,
  summary: {
    alertVerification: alertData.valid === true ? "passed" : "failed",
    capacitySloCompliance: capacityData?.compliance?.overallPassed === true ? "passed" : "failed",
    dosResilience: dosData.status === "success" ? "passed" : "failed",
  },
  alerts: alertData,
  capacity: capacityData,
  dosResilience: dosData,
  failures,
};

fs.writeFileSync(evidenceFile, JSON.stringify(unifiedEvidence, null, 2), "utf8");
' "$TIMESTAMP" "$DURATION_MS" "$DRILL_STATUS" "$ALERT_OUTPUT_JSON" \
  "$CAPACITY_OUTPUT_JSON" "$DOS_EVIDENCE_TMP" \
  "$FAILURES_JSON" \
  "$EVIDENCE_FILE"

printf '\n=================================================================\n'
printf 'Unified Drill Evidence: %s\n' "$EVIDENCE_FILE"
printf 'Total Duration:         %d ms\n' "$DURATION_MS"

if [ "$DRILL_STATUS" = "success" ]; then
  printf 'Overall Result:         PASSED. Capacity, alerts & DoS resilience satisfied.\n'
  printf '=================================================================\n\n'
  exit 0
else
  printf 'Overall Result:         FAILED. %d failure(s) detected.\n' "${#FAILURES[@]}"
  for fail in "${FAILURES[@]}"; do
    printf '  ✗ %s\n' "$fail"
  done
  printf '=================================================================\n\n'
  exit 1
fi
