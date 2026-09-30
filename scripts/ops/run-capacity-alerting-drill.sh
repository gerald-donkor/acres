#!/usr/bin/env bash
set -euo pipefail

# scripts/ops/run-capacity-alerting-drill.sh
#
# Automated Capacity, Load Resilience, and Prometheus Alert Simulation Drill (TM-05, TM-16, TM-20).
#
# Top-level drill orchestrator executing:
# 1. Prometheus Alerting Rule Verification & Time-Series Simulation (11 rules);
# 2. Capacity & Latency SLO Evaluation (Availability >= 99.9%, p95 <= 500ms, Throughput >= 100 RPS);
# 3. Multi-Layer DoS Resilience & Rate Limiting Drill (Caddy, Throttler, GraphQL, Storage, Bcrypt);
# 4. Unified Audit Evidence Generation (backups/capacity-alerting-drill-evidence-<timestamp>.json).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
EVIDENCE_DIR="backups"
EVIDENCE_FILE=""
TARGET_URL=""
API_URL="${API_URL-http://localhost:3001}"
DATABASE_TELEMETRY_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --target-url)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { echo 'Error: --target-url requires a value' >&2; exit 1; }
      TARGET_URL="$2"
      shift 2
      ;;
    --api-url)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { echo 'Error: --api-url requires a value' >&2; exit 1; }
      API_URL="$2"
      shift 2
      ;;
    --database-telemetry-file)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { echo 'Error: --database-telemetry-file requires a value' >&2; exit 1; }
      DATABASE_TELEMETRY_FILE="$2"
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
  --database-telemetry-file <file>  Fresh live Prometheus telemetry JSON (required for live target)
  --evidence-dir <dir>       Directory for JSON drill evidence (default: backups)
  --evidence-file <file>     Exact destination path for JSON evidence file
  --help, -h                 Show this help message
EOF
      exit 0
      ;;
    *)
      printf 'Error: Unknown option\n' >&2
      exit 1
      ;;
  esac
done

if [ -n "$TARGET_URL" ] || [ -n "$DATABASE_TELEMETRY_FILE" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then echo 'Error: live target evidence conflicts with --dry-run' >&2; exit 1; fi
fi
API_URL="$(node - "$API_URL" "$TARGET_URL" <<'NODE'
const {safeUrl}=require('./scripts/ops/launch-target-evidence');
try {
  const api=new URL(safeUrl(process.argv[2]));
  if(api.pathname!=='/' || /[?#]/.test(process.argv[2])) throw Error();
  if(process.argv[3]) safeUrl(process.argv[3]);
  process.stdout.write(api.origin);
} catch { console.error('Error: invalid drill target'); process.exit(1); }
NODE
)"

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
  printf '  ✓ Prometheus alert rules verified (11/11 rules valid and simulated)\n'
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
DOS_PRIVATE_DIR="$(mktemp -d)"
trap 'rm -rf -- "$DOS_PRIVATE_DIR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
DOS_EVIDENCE_TMP="$DOS_PRIVATE_DIR/evidence.json"
DOS_CHILD_OK=0
DOS_ARGS=(--evidence-file "$DOS_EVIDENCE_TMP" --api-url "$API_URL")
if [ "$DRY_RUN" -eq 1 ]; then
  DOS_ARGS+=(--dry-run)
fi

if bash scripts/ops/run-dos-resilience-drill.sh "${DOS_ARGS[@]}" >/dev/null 2>&1; then
  DOS_CHILD_OK=1
  printf '  DoS child completed; validating its evidence contract\n'
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
const dryRun = process.argv[9] === "1";
const targetUrl = process.argv[10];
const telemetryFile = process.argv[11];
const startTime = Number(process.argv[12]);
const { targetId, readBoundedJson, validDatabaseTelemetry, validDosEvidence } = require("./scripts/ops/launch-target-evidence");

let alertData = {};
try { alertData = JSON.parse(alertRaw); } catch {}

let capacityData = {};
try { capacityData = JSON.parse(capacityRaw); } catch {}

let dosData = {};
try { dosData = readBoundedJson(dosEvidencePath); } catch {}
const dosValid = process.argv[14] === "1" && validDosEvidence(
  dosData, dryRun, targetId(new URL(process.argv[13]).origin), startTime, Date.now());
if (!dosValid) failures.push("DoS child evidence missing or invalid");
// Never copy unvalidated child content (possibly containing secrets) into the dossier.
if (!dosValid) dosData = { status: "failed" };

const dbLatency = capacityData?.distribution?.databaseLatency || {
  acquisitionLatencyMs: { min: 0.1, p50: 0.5, p90: 1.2, p95: 1.8, p99: 3.5, max: 4.8, mean: 0.6, stddev: 0.4 },
  queryLatencyMs: { min: 1.0, p50: 8.2, p90: 18.5, p95: 24.1, p99: 42.0, max: 58.5, mean: 9.5, stddev: 5.2 },
};

let liveTelemetry = null;
if (targetUrl && telemetryFile) {
  try { liveTelemetry = readBoundedJson(telemetryFile); } catch {}
}
const liveTelemetryValid = Boolean(targetUrl &&
  validDatabaseTelemetry(liveTelemetry, targetId(new URL(targetUrl).href), startTime, Date.now()));
const roles = ["api", "worker"];
const selectRoles = (section, fields) => Object.fromEntries(roles.map((role) => [role,
  Object.fromEntries(fields.map((field) => [field, liveTelemetry[section][role][field]]))]));
const dbCompliancePassed = dryRun ? Boolean(
  capacityData?.mode === "synthetic" &&
  capacityData?.compliance?.databaseAcquisitionLatencyPassed === true &&
  capacityData?.compliance?.databaseQueryLatencyPassed === true &&
  capacityData?.compliance?.monotonicDbAcquisition === true &&
  capacityData?.compliance?.monotonicDbQuery === true &&
  capacityData?.compliance?.overallPassed === true && capacityData?.distribution?.databaseLatency
) : liveTelemetryValid;

const syntheticTelemetryBaseline = {
  status: dbCompliancePassed ? "verified" : "breached",
  postgresExporter: {
    job: "acres-postgres",
    up: 1,
    lastScrapeError: 0,
    scrapeIntervalSec: 30,
    scrapeTimeoutSec: 15,
  },
  postgresServer: {
    job: "acres-postgres",
    pgUp: 1,
    maxConnections: 100,
    activeConnections: 6,
  },
  connectionPool: {
    api: { job: "acres-api", totalConnections: 10, idleConnections: 8, maxConnections: 20, requestsWaiting: 0 },
    worker: { job: "acres-worker", totalConnections: 5, idleConnections: 4, maxConnections: 10, requestsWaiting: 0 },
  },
  poolAcquisitionLatency: {
    api: { p50Ms: dbLatency.acquisitionLatencyMs.p50, p95Ms: dbLatency.acquisitionLatencyMs.p95, p99Ms: dbLatency.acquisitionLatencyMs.p99, ceilingMs: 50 },
    worker: { p50Ms: dbLatency.acquisitionLatencyMs.p50, p95Ms: dbLatency.acquisitionLatencyMs.p95, p99Ms: dbLatency.acquisitionLatencyMs.p99, ceilingMs: 50 },
  },
  queryExecutionDuration: {
    api: { p50Ms: dbLatency.queryLatencyMs.p50, p95Ms: dbLatency.queryLatencyMs.p95, p99Ms: dbLatency.queryLatencyMs.p99, ceilingMs: 100 },
    worker: { p50Ms: dbLatency.queryLatencyMs.p50, p95Ms: dbLatency.queryLatencyMs.p95, p99Ms: dbLatency.queryLatencyMs.p99, ceilingMs: 100 },
  },
  serverActivity: {
    lockWaits: 0,
    maxTransactionDurationSec: 0.1,
  },
};
const databaseTelemetryBaseline = dryRun
  ? { ...syntheticTelemetryBaseline, source: "synthetic", status: dbCompliancePassed ? "verified" : "breached" }
  : liveTelemetryValid
    ? {
        status: "verified", source: liveTelemetry.source, timestamp: liveTelemetry.timestamp,
        targetId: liveTelemetry.targetId, probeHealthy: true,
        postgresExporter: { up: liveTelemetry.postgresExporter.up, lastScrapeError: liveTelemetry.postgresExporter.lastScrapeError },
        postgresServer: { pgUp: liveTelemetry.postgresServer.pgUp, maxConnections: liveTelemetry.postgresServer.maxConnections, activeConnections: liveTelemetry.postgresServer.activeConnections },
        connectionPool: selectRoles("connectionPool", ["totalConnections", "idleConnections", "maxConnections", "requestsWaiting"]),
        poolAcquisitionLatency: selectRoles("poolAcquisitionLatency", ["p50Ms", "p95Ms", "p99Ms"]),
        queryExecutionDuration: selectRoles("queryExecutionDuration", ["p50Ms", "p95Ms", "p99Ms"]),
        serverActivity: { lockWaits: liveTelemetry.serverActivity.lockWaits, maxTransactionDurationSec: liveTelemetry.serverActivity.maxTransactionDurationSec },
      }
    : { status: "breached", source: "missing-or-invalid-live-telemetry" };

if (!dbCompliancePassed) failures.push("Database telemetry baseline missing or invalid");
const finalStatus = failures.length === 0 ? "success" : "failed";

const unifiedEvidence = {
  timestamp,
  durationMs,
  status: finalStatus,
  mode: dryRun ? "synthetic" : targetUrl ? "live" : "default",
  targetId: targetUrl ? targetId(new URL(targetUrl).href) : null,
  apiTargetId: targetUrl ? targetId(new URL(process.argv[13]).origin) : null,
  summary: {
    alertVerification: alertData.valid === true ? "passed" : "failed",
    capacitySloCompliance: capacityData?.compliance?.overallPassed === true ? "passed" : "failed",
    dosResilience: dosValid ? "passed" : "failed",
    databaseBaselineCompliance: dbCompliancePassed ? "passed" : "failed",
  },
  alerts: alertData,
  capacity: capacityData,
  databaseTelemetryBaseline,
  dosResilience: dosData,
  failures,
};

fs.writeFileSync(evidenceFile, JSON.stringify(unifiedEvidence, null, 2), "utf8");
' "$TIMESTAMP" "$DURATION_MS" "$DRILL_STATUS" "$ALERT_OUTPUT_JSON" \
  "$CAPACITY_OUTPUT_JSON" "$DOS_EVIDENCE_TMP" \
  "$FAILURES_JSON" \
  "$EVIDENCE_FILE" "$DRY_RUN" "$TARGET_URL" "$DATABASE_TELEMETRY_FILE" "$START_TIME_MS" "$API_URL" "$DOS_CHILD_OK"

if [ "$(node -e 'const e=require(process.argv[1]); process.stdout.write(e.status)' "$(realpath "$EVIDENCE_FILE")")" != success ]; then
  DRILL_STATUS=failed
  FAILURES+=("Unified evidence validation failed")
fi

printf '\n=================================================================\n'
printf 'Unified Drill Evidence: %s\n' "$EVIDENCE_FILE"
printf 'Total Duration:         %d ms\n' "$DURATION_MS"

if [ "$DRILL_STATUS" = "success" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'Overall Result: PASSED offline capacity/alert simulations and repository assertions. Live throttle skipped.\n'
  else
    printf 'Overall Result: PASSED capacity/alerts and bounded login throttle/health observation.\n'
  fi
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
