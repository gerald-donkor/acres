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
      if [ $# -lt 2 ] || [ -z "$2" ] || [[ "$2" == --* ]]; then
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
  "$CADDYFILE" "$COMPOSE_FILE" "$EVIDENCE_DIR" "$OUTPUT_PATH" "$DATABASE_TELEMETRY_FILE" || exit 1

if [ "$DRY_RUN" -eq 1 ] && { [ -n "$TARGET_URL" ] || [ -n "$API_URL" ] || [ -n "$DATABASE_TELEMETRY_FILE" ] || [ "$ALLOW_HSTS" -eq 1 ]; }; then
  echo 'Error: --dry-run conflicts with live target options' >&2; exit 1
fi
if [ -n "$TARGET_URL" ] || [ -n "$API_URL" ]; then
  if [ -z "$TARGET_URL" ] || [ -z "$API_URL" ]; then
    echo 'Error: --target-url and --api-url must be supplied together' >&2; exit 1
  fi
  node -e 'const {safeUrl}=require("./scripts/ops/launch-target-evidence"); safeUrl(process.argv[1]); const api=new URL(safeUrl(process.argv[2])); if(api.pathname!=="/") throw Error("API target must be an origin")' "$TARGET_URL" "$API_URL" || exit 1
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

START_MS="$(get_time_ms)"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
mkdir -p "$EVIDENCE_DIR"

if [ -z "$OUTPUT_PATH" ]; then
  OUTPUT_PATH="${EVIDENCE_DIR}/launch-evidence-dossier-${STAMP}.json"
fi
mkdir -p "$(dirname "$OUTPUT_PATH")"

ENVIRONMENT="drill"

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
  if [ "$VERBOSE" -eq 1 ]; then printf '  Running stage %s\n' "$stage_id"; fi
  snap_before="$(mktemp)"
  ls -1 "$EVIDENCE_DIR" 2>/dev/null | sort >"$snap_before"
  start_ms="$(get_time_ms)"
  status="PASSED"
  err=""
  if ! "$@" >"$log_file" 2>&1; then
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

child_dry=()
if [ "$DRY_RUN" -eq 1 ]; then child_dry=(--dry-run); fi
stage_supply_chain() {
  node scripts/ops/generate-sbom.js --verify-licenses --output "${EVIDENCE_DIR}/sbom-inventory-${STAMP}.json" &&
  node scripts/ops/run-sast-scan.js --output "${EVIDENCE_DIR}/sast-scan-evidence-${STAMP}.json" &&
  node scripts/ops/verify-container-security.js --output "${EVIDENCE_DIR}/container-security-evidence-${STAMP}.json"
}
stage_ingress() {
  local hsts=()
  if [ "$ALLOW_HSTS" -eq 1 ]; then hsts=(--allow-hsts); fi
  node scripts/ops/verify-caddy-routing.js "$CADDYFILE" "${hsts[@]}" --output "${EVIDENCE_DIR}/caddy-routing-evidence-${STAMP}.json" &&
  bash scripts/ops/run-deployment-drill.sh "${child_dry[@]}" "${hsts[@]}" --caddyfile "$CADDYFILE" --compose-file "$COMPOSE_FILE" --api-url "${API_URL:-http://localhost:3001}" --evidence-dir "$EVIDENCE_DIR"
}
stage_disaster_recovery() {
  bash scripts/ops/run-restore-drill.sh "${child_dry[@]}" --backup-dir "$EVIDENCE_DIR" --evidence-file "${EVIDENCE_DIR}/restore-drill-evidence-${STAMP}.json" &&
  node scripts/ops/reconcile-storage-objects.js --dry-run --output "${EVIDENCE_DIR}/reconcile-report-${STAMP}.json"
}

# Stage 1: static templates & container runtime integrity
run_stage "static_templates" "Templates, runtime, secret scan" \
  node scripts/ops/run-static-integrity-checks.js --output "${EVIDENCE_DIR}/static-integrity-evidence-${STAMP}.json"

# Stage 2: supply-chain SBOM & SAST security scanning
run_stage "supply_chain_sast" "SBOM, SAST, container security" \
  stage_supply_chain

# Stage 3: Caddy ingress routing & deployment rollback preflight
run_stage "ingress_deployment" "Caddy routing + deployment drill" \
  stage_ingress

# Stage 4: production volume encryption key separation
run_stage "volume_encryption" "Volume encryption + key separation" \
  node scripts/ops/verify-volume-encryption.js --output "${EVIDENCE_DIR}/volume-encryption-evidence-${STAMP}.json"

# Stage 5: zero-downtime secret rotation & compromise drill.
# Always --dry-run: credential rotation stays an explicit operator action.
run_stage "secret_rotation" "Secret rotation drill" \
  bash scripts/ops/run-secret-rotation-drill.sh --dry-run --evidence-dir "$EVIDENCE_DIR"

# Stage 6: capacity benchmarking, DoS resilience & alert simulation
capacity_args=("${child_dry[@]}" --evidence-dir "$EVIDENCE_DIR")
if [ -z "$TARGET_URL" ] && [ "$DRY_RUN" -eq 0 ]; then
  capacity_args=(--dry-run --evidence-dir "$EVIDENCE_DIR")
fi
if [ -n "$TARGET_URL" ]; then capacity_args+=(--target-url "$TARGET_URL" --api-url "$API_URL"); fi
if [ -n "$DATABASE_TELEMETRY_FILE" ]; then capacity_args+=(--database-telemetry-file "$DATABASE_TELEMETRY_FILE"); fi
run_stage "capacity_alerting" "Capacity, DoS, alert simulation" \
  bash scripts/ops/run-capacity-alerting-drill.sh "${capacity_args[@]}"

# Stage 7: disaster recovery restore drill & reconciliation.
# NOTE (judgement, verified against the repo): unlike stages 1–6, neither
# run-restore-drill.sh --dry-run (requires PGPASSWORD + pg_isready) nor
# reconcile-storage-objects.js --dry-run (requires authenticated Postgres AND
# reachable Garage/S3) is fully offline. The stage always attempts the real
# sub-drills and fails closed when drill infra is absent.
run_stage "disaster_recovery" "Restore drill + reconciliation" \
  stage_disaster_recovery
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
const path = require("path");
const { validateStaticEvidence } = require("./scripts/ops/run-static-integrity-checks");
const { targetId, fileId } = require("./scripts/ops/launch-target-evidence");
const [outputPath, version, timestamp, environment, overall, total, passed, failed, durationS, durationMs, idsRaw, descsRaw, statusesRaw, msRaw, errsRaw, artsRaw, caddyfile, composeFile, targetUrl, apiUrl, allowHsts, dryRun] = process.argv.slice(1);
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
const explicitLiveTargets = Boolean(targetUrl && apiUrl);
const sameFile = (actual, expected) => {
  try { return fs.realpathSync(actual) === fs.realpathSync(expected); } catch { return false; }
};
const failStage = (stage, reason) => {
  stage.status = "FAILED";
  stage.error_message = reason;
};

const staticStage = stages.find((s) => s.stage_id === "static_templates");
const staticFiles = staticStage?.artifacts.filter((artifact) =>
  path.basename(artifact).startsWith("static-integrity-evidence-") && artifact.endsWith(".json")) || [];
let staticEvidence = null;
if (staticFiles.length === 1) {
  try {
    staticEvidence = JSON.parse(fs.readFileSync(staticFiles[0], "utf8"));
  } catch {}
}
const staticPassed = staticStage?.status === "PASSED" && validateStaticEvidence(staticEvidence).valid;
const staticIntegrityBaseline = staticPassed
  ? {
      status: "verified",
      totalChecks: staticEvidence.totalChecks,
      passedChecks: staticEvidence.passedChecks,
      failedChecks: staticEvidence.failedChecks,
      checks: staticEvidence.checks.map(({ id, passed, exitCode }) => ({ id, passed, exitCode })),
    }
  : { status: "breached", error_message: "stage 1 failed or child static integrity evidence failed verification" };
const staticIntegrityCompliance = staticPassed ? "passed" : "failed";

const capStage = stages.find((s) => s.stage_id === "capacity_alerting");
let capEvidence = null;
if (capStage) {
  const capFile = capStage.artifacts.find((a) => a.includes("capacity-alerting-drill-evidence-") && a.endsWith(".json"));
  if (capFile && fs.existsSync(capFile)) {
    try {
      capEvidence = JSON.parse(fs.readFileSync(capFile, "utf8"));
    } catch {}
  }
}
const capValid = Boolean(capStage?.status === "PASSED" && capEvidence && capEvidence.status === "success" &&
  Array.isArray(capEvidence.failures) && capEvidence.failures.length === 0 &&
  capEvidence.summary?.capacitySloCompliance === "passed" &&
  capEvidence.summary?.alertVerification === "passed" &&
  capEvidence.summary?.dosResilience === "passed" &&
  capEvidence.summary?.databaseBaselineCompliance === "passed" &&
  capEvidence.databaseTelemetryBaseline?.status === "verified" &&
  (dryRun === "1" ? capEvidence.mode === "synthetic" :
    explicitLiveTargets && capEvidence.mode === "live" &&
    capEvidence.targetId === targetId(new URL(targetUrl).href) &&
    capEvidence.apiTargetId === targetId(new URL(apiUrl).href) &&
    capEvidence.capacity?.mode === "live" &&
    capEvidence.capacity?.targetUrl === targetId(new URL(targetUrl).href) &&
    capEvidence.databaseTelemetryBaseline?.source === "prometheus-live-scrape"));
if (!capValid) failStage(capStage, "stage 6 child missing, synthetic, failed, or mismatched live target/telemetry");

const dbCompliancePassed = Boolean(
  capStage?.status === "PASSED" &&
  capEvidence?.summary?.databaseBaselineCompliance === "passed" &&
  capEvidence?.databaseTelemetryBaseline?.status === "verified"
);

const databaseTelemetryBaseline =
  capValid && capEvidence?.databaseTelemetryBaseline && capEvidence.databaseTelemetryBaseline.status
    ? capEvidence.databaseTelemetryBaseline
    : { status: "breached" };

const alertVerification = capEvidence?.summary?.alertVerification === "passed" ? "passed" : "failed";
const dosResilience = capEvidence?.summary?.dosResilience === "passed" ? "passed" : "failed";

const drStage = stages.find((s) => s.stage_id === "disaster_recovery");
let restoreEvidence = null;
let reconcileEvidence = null;
if (drStage && drStage.status === "PASSED") {
  const restoreFile = drStage.artifacts.find((a) => a.includes("restore-drill-evidence-") && a.endsWith(".json"));
  if (restoreFile && fs.existsSync(restoreFile)) {
    try {
      restoreEvidence = JSON.parse(fs.readFileSync(restoreFile, "utf8"));
    } catch {}
  }
  const reconcileFile = drStage.artifacts.find((a) => (a.includes("reconcile-report-") || a.includes("reconciliation-report")) && a.endsWith(".json"));
  if (reconcileFile && fs.existsSync(reconcileFile)) {
    try {
      reconcileEvidence = JSON.parse(fs.readFileSync(reconcileFile, "utf8"));
    } catch {}
  }
}

const restorePassed = Boolean(
  drStage?.status === "PASSED" &&
  restoreEvidence &&
  restoreEvidence.rto_compliant === true &&
  restoreEvidence.record_parity_verified === true &&
  restoreEvidence.postgis_verified === true &&
  restoreEvidence.foreign_keys_verified === true &&
  typeof restoreEvidence.tables_source === "number" &&
  restoreEvidence.tables_source === restoreEvidence.tables_restored &&
  typeof restoreEvidence.migrations_source === "number" &&
  restoreEvidence.migrations_source === restoreEvidence.migrations_restored &&
  restoreEvidence.status === "success"
);

const reconcilePassed = Boolean(
  drStage?.status === "PASSED" &&
  reconcileEvidence &&
  reconcileEvidence.summary &&
  reconcileEvidence.summary.status !== "error" &&
  reconcileEvidence.summary.missingObjects === 0 &&
  reconcileEvidence.summary.mismatchedObjects === 0 &&
  reconcileEvidence.summary.exitCode === 0
);

let disasterRecoveryBaseline;
if (restorePassed && reconcilePassed) {
  disasterRecoveryBaseline = {
    status: "verified",
    restoreDrill: {
      rtoSeconds: restoreEvidence.duration_seconds,
      rtoTargetSeconds: restoreEvidence.rto_target_seconds,
      rtoCompliant: restoreEvidence.rto_compliant,
      tablesSource: restoreEvidence.tables_source,
      tablesRestored: restoreEvidence.tables_restored,
      migrationsSource: restoreEvidence.migrations_source,
      migrationsRestored: restoreEvidence.migrations_restored,
      postgisVerified: restoreEvidence.postgis_verified,
      foreignKeysVerified: restoreEvidence.foreign_keys_verified,
      recordParityVerified: restoreEvidence.record_parity_verified,
    },
    storageReconciliation: {
      totalDatabaseObjects: reconcileEvidence.summary.totalDatabaseObjects,
      totalBucketObjects: reconcileEvidence.summary.totalBucketObjects,
      matchedObjects: reconcileEvidence.summary.matchedObjects,
      missingObjects: reconcileEvidence.summary.missingObjects,
      orphanObjects: reconcileEvidence.summary.orphanObjects,
      mismatchedObjects: reconcileEvidence.summary.mismatchedObjects,
      status: reconcileEvidence.summary.status,
    },
  };
} else {
  disasterRecoveryBaseline = {
    status: "breached",
    error_message: drStage?.error_message || "stage 7 failed or child evidence failed verification",
  };
}

const restoreCompliance = restorePassed ? "passed" : "failed";
const reconcileCompliance = reconcilePassed ? "passed" : "failed";

const depStage = stages.find((s) => s.stage_id === "ingress_deployment");
let depEvidence = null;
let caddyEvidence = null;
if (depStage) {
  const depFile = depStage.artifacts.find((a) => a.includes("deployment-drill-evidence-") && a.endsWith(".json"));
  if (depFile && fs.existsSync(depFile)) {
    try {
      depEvidence = JSON.parse(fs.readFileSync(depFile, "utf8"));
    } catch {}
  }
  const caddyFile = depStage.artifacts.find((a) => a.includes("caddy-routing-evidence-") && a.endsWith(".json"));
  if (caddyFile && fs.existsSync(caddyFile)) {
    try {
      caddyEvidence = JSON.parse(fs.readFileSync(caddyFile, "utf8"));
    } catch {}
  }
}
const caddyIsExample = path.basename(caddyfile) === "Caddyfile.example";
const targetBound = Boolean(caddyEvidence && depEvidence &&
  sameFile(caddyEvidence.targetPath, caddyfile) && sameFile(depEvidence.caddyfile, caddyfile) &&
  sameFile(depEvidence.compose_file, composeFile));
const productionCandidate = explicitLiveTargets || !caddyIsExample || allowHsts === "1";
const liveIngressValid = !productionCandidate || Boolean(
  explicitLiveTargets && !caddyIsExample && allowHsts === "1" &&
  caddyEvidence.hstsApproved === true &&
  typeof caddyEvidence.domain === "string" && caddyEvidence.domain.includes(".") &&
  caddyEvidence.domain !== "example.com" &&
  caddyEvidence.domain.toLowerCase() === new URL(targetUrl).hostname.toLowerCase() &&
  depEvidence.probe_live_tested === true && depEvidence.dry_run === false &&
  depEvidence.api_target_id === targetId(new URL(apiUrl).href)
);
const routesValid = Boolean(caddyEvidence && Array.isArray(caddyEvidence.errors) &&
  caddyEvidence.errors.length === 0 && Number.isInteger(caddyEvidence.routesPassed) &&
  caddyEvidence.routesPassed >= 12 && caddyEvidence.routesPassed === caddyEvidence.routesEvaluated &&
  depEvidence?.caddy_routes_tested >= 12);
if (!targetBound || !routesValid || !liveIngressValid) {
  failStage(depStage, "stage 3 child missing, mismatched config, insufficient routes, or unverified live ingress");
}

const caddyPassed = Boolean(caddyEvidence &&
  caddyEvidence.status === "success" &&
  caddyEvidence.valid === true &&
  caddyEvidence.securityHeadersVerified === true &&
  caddyEvidence.s3SigV4HostPreserved === true &&
  caddyEvidence.proxyHeadersVerified === true
);

const depPassed = Boolean(
  depStage?.status === "PASSED" &&
  depEvidence &&
  depEvidence.status === "success" &&
  depEvidence.schema_backward_compatible === true &&
  depEvidence.caddy_routing_verified === true &&
  depEvidence.rollback_procedure_verified === true &&
  depEvidence.network_isolation_verified === true &&
  caddyPassed && targetBound && routesValid && liveIngressValid
);

let deploymentBaseline;
if (depPassed) {
  deploymentBaseline = {
    status: "verified",
    schemaBackwardCompatible: depEvidence.schema_backward_compatible,
    caddyRoutingVerified: depEvidence.caddy_routing_verified,
    rollbackProcedureVerified: depEvidence.rollback_procedure_verified,
    networkIsolationVerified: depEvidence.network_isolation_verified,
    migrationCount: depEvidence.migration_count,
    routesTested: depEvidence.caddy_routes_tested,
  };
} else {
  deploymentBaseline = {
    status: "breached",
    error_message: depStage?.error_message || "stage 3 failed or child deployment evidence failed verification",
  };
}

const deploymentCompliance = depPassed ? "passed" : "failed";
const rollbackCompliance = (depPassed && depEvidence?.rollback_procedure_verified === true) ? "passed" : "failed";

const secStage = stages.find((s) => s.stage_id === "secret_rotation");
let secEvidence = null;
if (secStage && secStage.status === "PASSED") {
  const secFile = secStage.artifacts.find((a) => a.includes("secret-rotation-evidence-") && a.endsWith(".json"));
  if (secFile && fs.existsSync(secFile)) {
    try {
      secEvidence = JSON.parse(fs.readFileSync(secFile, "utf8"));
    } catch {}
  }
}

const secPassed = Boolean(
  secStage?.status === "PASSED" &&
  secEvidence &&
  secEvidence.status === "success" &&
  Array.isArray(secEvidence.errors) &&
  secEvidence.errors.length === 0 &&
  secEvidence.steps?.session_rollover?.status === "passed" &&
  secEvidence.steps?.csrf_rollover?.status === "passed" &&
  secEvidence.steps?.database_rotation?.status === "passed" &&
  secEvidence.steps?.valkey_rotation?.status === "passed" &&
  secEvidence.steps?.storage_rotation?.status === "passed" &&
  secEvidence.steps?.compromise_response?.status === "passed" &&
  secEvidence.steps?.redaction_audit?.status === "passed" &&
  secEvidence.steps?.redaction_audit?.raw_secrets_masked === true &&
  secEvidence.steps?.redaction_audit?.zero_dev_passwords_detected === true
);

let secretRotationBaseline;
if (secPassed) {
  secretRotationBaseline = {
    status: "verified",
    steps: {
      sessionRollover: secEvidence.steps.session_rollover.status,
      csrfRollover: secEvidence.steps.csrf_rollover.status,
      databaseRotation: secEvidence.steps.database_rotation.status,
      valkeyRotation: secEvidence.steps.valkey_rotation.status,
      storageRotation: secEvidence.steps.storage_rotation.status,
      compromiseResponse: secEvidence.steps.compromise_response.status,
      redactionAudit: secEvidence.steps.redaction_audit.status,
    },
    redactionAudit: {
      rawSecretsMasked: secEvidence.steps.redaction_audit.raw_secrets_masked,
      zeroDevPasswordsDetected: secEvidence.steps.redaction_audit.zero_dev_passwords_detected,
    },
  };
} else {
  secretRotationBaseline = {
    status: "breached",
    error_message: secStage?.error_message || "stage 5 failed or child secret rotation evidence failed verification",
  };
}

const secretRotationCompliance = secPassed ? "passed" : "failed";

const volStage = stages.find((s) => s.stage_id === "volume_encryption");
let volEvidence = null;
if (volStage && volStage.status === "PASSED") {
  const volFile = volStage.artifacts.find((a) => a.includes("volume-encryption-evidence-") && a.endsWith(".json"));
  if (volFile && fs.existsSync(volFile)) {
    try {
      volEvidence = JSON.parse(fs.readFileSync(volFile, "utf8"));
    } catch {}
  }
}

const volPassed = Boolean(
  volStage?.status === "PASSED" &&
  volEvidence &&
  volEvidence.status === "success" &&
  volEvidence.valid === true &&
  Array.isArray(volEvidence.errors) &&
  volEvidence.errors.length === 0 &&
  Array.isArray(volEvidence.evaluatedMounts) &&
  volEvidence.evaluatedMounts.length >= 9 &&
  volEvidence.evaluatedMounts.every((m) => m.passed === true) &&
  volEvidence.keySeparation?.verified === true &&
  Array.isArray(volEvidence.keySeparation?.detectedViolations) &&
  volEvidence.keySeparation.detectedViolations.length === 0
);

let volumeEncryptionBaseline;
if (volPassed) {
  volumeEncryptionBaseline = {
    status: "verified",
    totalRequiredMounts: volEvidence.totalRequiredMounts,
    validMountsCount: volEvidence.validMountsCount,
    keySeparationVerified: volEvidence.keySeparation.verified,
    violationsDetected: volEvidence.keySeparation.detectedViolations.length,
    scannedPathsCount: Array.isArray(volEvidence.keySeparation.scannedPaths) ? volEvidence.keySeparation.scannedPaths.length : 0,
  };
} else {
  volumeEncryptionBaseline = {
    status: "breached",
    error_message: volStage?.error_message || "stage 4 failed or child volume encryption evidence failed verification",
  };
}

const volumeEncryptionCompliance = volPassed ? "passed" : "failed";

const scStage = stages.find((s) => s.stage_id === "supply_chain_sast");
let sbomEvidence = null;
let sastEvidence = null;
let containerEvidence = null;
if (scStage && scStage.status === "PASSED") {
  const sbomFile = scStage.artifacts.find((a) => a.includes("sbom-inventory-") && a.endsWith(".json"));
  if (sbomFile && fs.existsSync(sbomFile)) {
    try {
      sbomEvidence = JSON.parse(fs.readFileSync(sbomFile, "utf8"));
    } catch {}
  }
  const sastFile = scStage.artifacts.find((a) => a.includes("sast-scan-evidence-") && a.endsWith(".json"));
  if (sastFile && fs.existsSync(sastFile)) {
    try {
      sastEvidence = JSON.parse(fs.readFileSync(sastFile, "utf8"));
    } catch {}
  }
  const containerFile = scStage.artifacts.find((a) => a.includes("container-security-evidence-") && a.endsWith(".json"));
  if (containerFile && fs.existsSync(containerFile)) {
    try {
      containerEvidence = JSON.parse(fs.readFileSync(containerFile, "utf8"));
    } catch {}
  }
}

const scPassed = Boolean(
  scStage?.status === "PASSED" &&
  sbomEvidence && Array.isArray(sbomEvidence.components) && sbomEvidence.components.length > 0 &&
  (!sbomEvidence.licenseCompliance || (sbomEvidence.licenseCompliance.compliant === true && Array.isArray(sbomEvidence.licenseCompliance.violations) && sbomEvidence.licenseCompliance.violations.length === 0)) &&
  sastEvidence && (sastEvidence.status === "success" || sastEvidence.passed === true) && sastEvidence.passed === true &&
  Array.isArray(sastEvidence.blockingActiveFindings) && sastEvidence.blockingActiveFindings.length === 0 &&
  Array.isArray(sastEvidence.expiredFindings) && sastEvidence.expiredFindings.length === 0 &&
  containerEvidence && (containerEvidence.status === "success" || containerEvidence.valid === true) && containerEvidence.valid === true &&
  Array.isArray(containerEvidence.errors) && containerEvidence.errors.length === 0 &&
  Array.isArray(containerEvidence.checks) && containerEvidence.checks.length > 0 &&
  containerEvidence.checks.every((c) => c.passed === true)
);

let supplyChainBaseline;
if (scPassed) {
  supplyChainBaseline = {
    status: "verified",
    sbom: {
      packagesCount: sbomEvidence.components.length,
      licenseComplianceVerified: sbomEvidence.licenseCompliance ? sbomEvidence.licenseCompliance.compliant : true,
      violationsCount: sbomEvidence.licenseCompliance?.violations?.length || 0,
    },
    sast: {
      filesScanned: sastEvidence.scannedFilesCount,
      totalFindingsCount: sastEvidence.totalFindingsCount,
      triagedFindingsCount: Array.isArray(sastEvidence.triagedFindings) ? sastEvidence.triagedFindings.length : 0,
      expiredFindingsCount: Array.isArray(sastEvidence.expiredFindings) ? sastEvidence.expiredFindings.length : 0,
      blockingActiveFindingsCount: Array.isArray(sastEvidence.blockingActiveFindings) ? sastEvidence.blockingActiveFindings.length : 0,
      passed: sastEvidence.passed,
    },
    containerSecurity: {
      valid: containerEvidence.valid,
      totalChecks: Array.isArray(containerEvidence.checks) ? containerEvidence.checks.length : 0,
      passedChecks: Array.isArray(containerEvidence.checks) ? containerEvidence.checks.filter((c) => c.passed).length : 0,
      errorsCount: Array.isArray(containerEvidence.errors) ? containerEvidence.errors.length : 0,
    },
  };
} else {
  supplyChainBaseline = {
    status: "breached",
    error_message: scStage?.error_message || "stage 2 failed or child supply chain / SAST / container evidence failed verification",
  };
}

const supplyChainCompliance = scPassed ? "passed" : "failed";
const sastCompliance = (scPassed && sastEvidence?.passed === true) ? "passed" : "failed";
const containerSecurityCompliance = (scPassed && containerEvidence?.valid === true) ? "passed" : "failed";

const dossier = {
  version,
  timestamp,
  environment,
  overall_status: stages.every((s) => s.status === "PASSED") ? "PASSED" : "FAILED",
  total_stages: Number(total),
  passed_stages: stages.filter((s) => s.status === "PASSED").length,
  failed_stages: stages.filter((s) => s.status === "FAILED").length,
  duration_seconds: Number(durationS),
  stages,
  targets: {
    caddyfile: fileId(caddyfile), composeFile: fileId(composeFile),
    capacity: targetUrl ? targetId(new URL(targetUrl).href) : null,
    api: apiUrl ? targetId(new URL(apiUrl).href) : null,
    mode: dryRun === "1" ? "offline" : explicitLiveTargets ? "live-target-drill" : "default-drill",
  },
  staticIntegrityBaseline,
  supplyChainBaseline,
  databaseTelemetryBaseline,
  disasterRecoveryBaseline,
  deploymentBaseline,
  secretRotationBaseline,
  volumeEncryptionBaseline,
  summary: {
    staticIntegrity: statuses[0] === "PASSED" ? "passed" : "failed",
    staticIntegrityCompliance,
    supplyChainSecurity: statuses[1] === "PASSED" ? "passed" : "failed",
    supplyChainCompliance,
    sastCompliance,
    containerSecurityCompliance,
    ingressDeployment: depStage.status === "PASSED" ? "passed" : "failed",
    volumeEncryption: statuses[3] === "PASSED" ? "passed" : "failed",
    secretRotation: statuses[4] === "PASSED" ? "passed" : "failed",
    capacityAlerting: capStage.status === "PASSED" ? "passed" : "failed",
    disasterRecovery: statuses[6] === "PASSED" ? "passed" : "failed",
    sloCompliance: capStage.status === "PASSED" ? "capacity_alerts_verified" : "capacity_alerts_failed",
    recoveryCompliance: (restoreCompliance === "passed" && reconcileCompliance === "passed") ? "restore_reconcile_verified" : "restore_reconcile_failed",
    alertVerification,
    dosResilience,
    databaseBaselineCompliance: dbCompliancePassed ? "passed" : "failed",
    restoreCompliance,
    reconcileCompliance,
    deploymentCompliance,
    rollbackCompliance,
    secretRotationCompliance,
    volumeEncryptionCompliance,
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
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_ARTIFACTS[@]}")" \
  "$CADDYFILE" "$COMPOSE_FILE" "$TARGET_URL" "$API_URL" "$ALLOW_HSTS" "$DRY_RUN"

OVERALL="$(node -e 'process.stdout.write(require(process.argv[1]).overall_status)' "$(realpath "$OUTPUT_PATH")")"
PASSED="$(node -e 'process.stdout.write(String(require(process.argv[1]).passed_stages))' "$(realpath "$OUTPUT_PATH")")"
FAILED=$((TOTAL - PASSED))

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
