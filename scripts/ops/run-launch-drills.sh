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
#   backups/launch-evidence-dossier-<uuid>.json
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
#   4. volume_encryption       — volume declarations + local filename scan preflight
#   5. secret_rotation         — secret rotation drill (always --dry-run)
#   6. capacity_alerting       — capacity benchmark, DoS resilience, alert simulation
#   7. disaster_recovery       — restore drill + storage reconciliation

fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd -P)" || fail 'Installation root unavailable'
cd -- "$ROOT_DIR" 2>/dev/null || fail 'Installation root unavailable'
OPS="$ROOT_DIR/scripts/ops"
ASSEMBLER="$OPS"/assemble-launch-dossier.js

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
  --dry-run                Disable supported child mutations/traffic. NOT a fully
                           isolated run: static checks can contact npm, rotation
                           can observe reachability, and reconciliation needs services.
                           Without it, selected children exercise drill infrastructure.
                           Rotation and reconciliation always stay --dry-run.
  --json                   Print this invocation's dossier JSON (also on evaluated failure)
  --output <path>          Absent exact dossier path; existing evidence is preserved
  --evidence-dir <dir>     Directory for the dossier, stage logs, and child
                           evidence (default: backups)
  --verbose                Print each stage ID before executing it
  --caddyfile <file>       Caddyfile to verify in both stage 3 children
  --compose-file <file>    Compose file for the deployment drill
  --target-url <url>      Live capacity benchmark target
  --api-url <url>         Live API target for DoS and readiness probes
  --database-telemetry-file <file>  Fresh live database telemetry JSON
  --allow-hsts            Verify active HSTS in the selected Caddyfile
  --help, -h               Show this help message without side effects
Value options accept separate and attached = forms once each.
Relative paths resolve against the installation repository, not caller cwd.
Explicit benchmark/API targets require fresh database telemetry before work.
Only isolated fixture tests avoid all real services. A dossier never approves launch.
EOF
}

declare -A SEEN=()
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --json) JSON_OUT=1; shift ;;
    --verbose) VERBOSE=1; shift ;;
    --allow-hsts) ALLOW_HSTS=1; shift ;;
    --output|--output=*|--evidence-dir|--evidence-dir=*|--caddyfile|--caddyfile=*|--compose-file|--compose-file=*|--target-url|--target-url=*|--api-url|--api-url=*|--database-telemetry-file|--database-telemetry-file=*)
      opt="${1%%=*}"
      [[ -z "${SEEN[$opt]:-}" ]] || fail "Repeated $opt option"
      if [[ "$1" == *=* ]]; then val="${1#*=}"; shift
      else
        (($# >= 2)) && [[ "$2" != -* ]] || fail "$opt requires a value"
        val="$2"; shift 2
      fi
      [[ "$val" =~ [^[:space:]] && ! "$val" =~ [[:cntrl:]] ]] || fail "$opt requires a valid value"
      SEEN[$opt]=1
      case "$opt" in
        --output) OUTPUT_PATH="$val" ;;
        --evidence-dir) EVIDENCE_DIR="$val" ;;
        --caddyfile) CADDYFILE="$val" ;;
        --compose-file) COMPOSE_FILE="$val" ;;
        --target-url) TARGET_URL="$val" ;;
        --api-url) API_URL="$val" ;;
        --database-telemetry-file) DATABASE_TELEMETRY_FILE="$val" ;;
      esac ;;
    *) fail 'Unknown option or unexpected positional argument' ;;
  esac
done
for tool in node bash date dirname mkdir mktemp sleep cat rm; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required utility unavailable: $tool"
done
for file in assemble-launch-dossier.js launch-target-evidence.js run-static-integrity-checks.js generate-sbom.js run-sast-scan.js verify-container-security.js verify-caddy-routing.js run-deployment-drill.sh verify-volume-encryption.js run-secret-rotation-drill.sh run-capacity-alerting-drill.sh run-restore-drill.sh reconcile-storage-objects.js; do
  [[ -f "$OPS/$file" && -r "$OPS/$file" ]] || fail 'Required installed child or helper unavailable'
done
# Read-only preflight; helper/runtime diagnostics cannot expose rejected input.
PREFLIGHT="$(node - "$OPS" "$DRY_RUN" "$ALLOW_HSTS" "$TARGET_URL" "$API_URL" "$DATABASE_TELEMETRY_FILE" "$CADDYFILE" "$COMPOSE_FILE" "$EVIDENCE_DIR" "$OUTPUT_PATH" 2>/dev/null <<'NODE'
try {
  const fs = require('node:fs'),
    path = require('node:path');
  const [
    ops,
    dry,
    hsts,
    targetRaw,
    apiRaw,
    telemetryRaw,
    caddyRaw,
    composeRaw,
    dirRaw,
    outputRaw,
  ] = process.argv.slice(2);
  const helper = require(ops + '/assemble-launch-dossier');
  // Process supervision requires Linux procfs, including visible group states.
  if (process.platform !== 'linux' || !fs.readdirSync('/proc').includes('self'))
    throw Error();
  fs.readFileSync('/proc/self/stat', 'utf8');
  const {
    safeUrl,
    targetId,
    readBoundedJson,
    validDatabaseTelemetry,
  } = require(ops + '/launch-target-evidence');
  if (
    ![
      helper.outputPreflight,
      helper.directory,
      helper.prepareOutput,
      helper.releaseOutput,
      helper.publish,
      helper.assemble,
      helper.validateDossier,
      helper.readReceipt,
      safeUrl,
      targetId,
      readBoundedJson,
      validDatabaseTelemetry,
    ].every((fn) => typeof fn === 'function')
  )
    throw Error();
  const value = (v) =>
    typeof v === 'string' && v.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(v);
  if (
    ![process.cwd(), caddyRaw, composeRaw, dirRaw].every(value) ||
    [outputRaw, targetRaw, apiRaw, telemetryRaw].some((v) => v && !value(v))
  )
    throw Error();
  if (dry === '1' && (targetRaw || apiRaw || telemetryRaw || hsts === '1'))
    throw Error();
  if (
    Boolean(targetRaw) !== Boolean(apiRaw) ||
    Boolean(targetRaw) !== Boolean(telemetryRaw)
  )
    throw Error();
  let target = '',
    api = '';
  if (targetRaw) {
    if (/[?#]/.test(targetRaw) || /[?#]/.test(apiRaw)) throw Error();
    target = safeUrl(targetRaw);
    const url = new URL(safeUrl(apiRaw));
    if (url.pathname !== '/') throw Error();
    api = url.origin;
    const telemetry = readBoundedJson(path.resolve(telemetryRaw));
    const now = Date.now();
    if (!validDatabaseTelemetry(telemetry, targetId(target), now, now))
      throw Error();
  }
  const caddy = path.resolve(caddyRaw),
    compose = path.resolve(composeRaw);
  for (const file of [caddy, compose]) {
    if (!fs.statSync(file).isFile()) throw Error();
    fs.accessSync(file, fs.constants.R_OK);
  }
  if (outputRaw.endsWith(path.sep)) throw Error();
  const dir = path.resolve(dirRaw);
  const output = outputRaw
    ? path.resolve(outputRaw)
    : path.join(
        dir,
        'launch-evidence-dossier-' +
          require('node:crypto').randomUUID() +
          '.json',
      );
  helper.outputPreflight(output, dir);
  process.stdout.write(
    [
      target,
      api,
      telemetryRaw ? path.resolve(telemetryRaw) : '',
      caddy,
      compose,
      dir,
      output,
    ].join('\n'),
  );
} catch {
  process.exit(1);
}
NODE
)" || fail 'Invalid invocation, prerequisite, telemetry or evidence destination'
mapfile -t PREFLIGHT_VALUES <<< "$PREFLIGHT"
((${#PREFLIGHT_VALUES[@]} == 7)) || fail 'Incomplete invocation preflight'
TARGET_URL="${PREFLIGHT_VALUES[0]}"; API_URL="${PREFLIGHT_VALUES[1]}"
DATABASE_TELEMETRY_FILE="${PREFLIGHT_VALUES[2]}"
CADDYFILE="${PREFLIGHT_VALUES[3]}"; COMPOSE_FILE="${PREFLIGHT_VALUES[4]}"
EVIDENCE_DIR="${PREFLIGHT_VALUES[5]}"; OUTPUT_PATH="${PREFLIGHT_VALUES[6]}"

get_time_ms() {
  local ms
  ms="$(date +%s%3N 2>/dev/null || true)"
  if [[ "$ms" =~ ^[0-9]+$ ]]; then
    echo "$ms"
  else
    ms="$(date +%s 2>/dev/null)" || return 1
    [[ "$ms" =~ ^[0-9]{1,12}$ ]] || return 1
    echo "$((10#$ms * 1000))"
  fi
}

umask 077
RUN_DIR=""; VIEW_PATH=""; CHILD_PID=""; RESERVED=0
release_resources() {
  local failed=0
  if [[ -n "$VIEW_PATH" ]]; then rm -f -- "$VIEW_PATH" 2>/dev/null || failed=1; fi
  if ((RESERVED)); then
    node "$ASSEMBLER" release "$OUTPUT_PATH" "$RUN_DIR" >/dev/null 2>&1 || failed=1
  fi
  if (( ! failed )); then VIEW_PATH=""; RESERVED=0; fi
  return "$failed"
}
# kill -0 includes zombies. Linux procfs distinguishes terminated members from
# live/stopped descendants after the leader exits (proc_pid_stat fields 3/5).
group_active() {
  node - "$CHILD_PID" 2>/dev/null <<'NODE'
try {
  const fs = require('node:fs');
  const group = process.argv[2];
  for (const name of fs.readdirSync('/proc')) {
    if (!/^[0-9]+$/.test(name)) continue;
    let stat;
    try {
      stat = fs.readFileSync('/proc/' + name + '/stat', 'utf8');
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) continue;
      throw error;
    }
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    if (fields[2] === group && !['Z', 'X', 'x'].includes(fields[0]))
      process.exit(0);
  }
  process.exit(1);
} catch {
  process.exit(2);
}
NODE
}
terminate_group() {
  local state attempt
  kill -TERM -- "-$CHILD_PID" 2>/dev/null || true
  for attempt in {1..20}; do
    if group_active; then state=0; else state=$?; fi
    if ((state == 1)); then wait -f "$CHILD_PID" 2>/dev/null || true; CHILD_PID=""; return 0; fi
    ((state == 0)) || return 1
    sleep 0.05 || return 1
  done
  kill -KILL -- "-$CHILD_PID" 2>/dev/null || true
  for attempt in {1..20}; do
    if group_active; then state=0; else state=$?; fi
    if ((state == 1)); then wait -f "$CHILD_PID" 2>/dev/null || true; CHILD_PID=""; return 0; fi
    ((state == 0)) || return 1
    sleep 0.05 || return 1
  done
  return 1
}
cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [[ -n "$CHILD_PID" ]]; then
    if ! terminate_group; then
      printf 'Error: Owned stage termination could not be verified; reservation retained\n' >&2
      exit 1
    fi
  fi
  if ! release_resources; then
    printf 'Error: Owned publication cleanup failed\n' >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
START_MS="$(get_time_ms)" || fail 'Time source unavailable'
[[ "$START_MS" =~ ^[0-9]+$ ]] || fail 'Invalid time source'
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null)" || fail 'Time source unavailable'
node -e 'const h=require(process.argv[1]); if(!Number.isSafeInteger(Number(process.argv[3])) || !h.freshTimestamp(process.argv[2], Number(process.argv[3]), Date.now())) process.exit(1)' "$ASSEMBLER" "$TIMESTAMP" "$START_MS" 2>/dev/null || fail 'Invalid time source'
node -e 'require(process.argv[1]).directory(process.argv[2], true)' "$ASSEMBLER" "$EVIDENCE_DIR" 2>/dev/null || fail 'Evidence directory unavailable'
RUN_DIR="$(mktemp -d -- "${EVIDENCE_DIR}/launch-drill-run-XXXXXXXXXXXX" 2>/dev/null)" || fail 'Private run directory unavailable'
# Token checks in release preserve a foreign reservation even if prepare fails.
RESERVED=1
node "$ASSEMBLER" prepare "$OUTPUT_PATH" "$RUN_DIR" 2>/dev/null || fail 'Dossier destination unavailable'
VIEW_PATH="$RUN_DIR/.dossier-view.json"
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
  mkdir -- "$STAGE_DIR" 2>/dev/null || fail 'Stage directory unavailable'
  log_file="${STAGE_DIR}/launch-drill-stage-${stage_id}.log"
  if [ "$VERBOSE" -eq 1 ]; then printf '  Running stage %s\n' "$stage_id"; fi
  start_ms="$(get_time_ms)"
  status="PASSED"; err=""
  "$@" >"$log_file" 2>&1 &
  CHILD_PID=$!
  if ! wait -f "$CHILD_PID"; then status="FAILED"; err="child process failed; inspect private stage log"; fi
  local group_state
  if group_active; then group_state=0; else group_state=$?; fi
  if ((group_state == 0)); then
    status="FAILED"; err="child descendants outlived stage; inspect private stage log"
    terminate_group || fail 'Owned stage termination could not be verified'
  elif ((group_state == 1)); then CHILD_PID=""
  else fail 'Owned stage state unavailable'
  fi
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
printf 'Mode:                 %s\n' "$([ "$DRY_RUN" -eq 1 ] && echo 'dry-run (service-dependent)' || echo 'live')"
printf 'Dossier destination:  %s\n' "$OUTPUT_PATH"
printf 'Timestamp:            %s\n\n' "$TIMESTAMP"

child_dry=()
if [ "$DRY_RUN" -eq 1 ]; then child_dry=(--dry-run); fi
stage_supply_chain() {
  node "$OPS"/generate-sbom.js --verify-licenses --output "${STAGE_DIR}/sbom-inventory-receipt.json" &&
  node "$OPS"/run-sast-scan.js --output "${STAGE_DIR}/sast-scan-evidence-receipt.json" &&
  node "$OPS"/verify-container-security.js --output "${STAGE_DIR}/container-security-evidence-receipt.json"
}
stage_ingress() {
  local hsts=()
  if [ "$ALLOW_HSTS" -eq 1 ]; then hsts=(--allow-hsts); fi
  node "$OPS"/verify-caddy-routing.js "$CADDYFILE" "${hsts[@]}" --output "${STAGE_DIR}/caddy-routing-evidence-receipt.json" &&
  bash "$OPS"/run-deployment-drill.sh "${child_dry[@]}" "${hsts[@]}" --caddyfile "$CADDYFILE" --compose-file "$COMPOSE_FILE" --api-url "${API_URL:-http://localhost:3001}" --evidence-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/deployment-drill-evidence-receipt.json"
}
stage_disaster_recovery() {
  bash "$OPS"/run-restore-drill.sh "${child_dry[@]}" --backup-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/restore-drill-evidence-receipt.json" &&
  node "$OPS"/reconcile-storage-objects.js --dry-run --output "${STAGE_DIR}/reconcile-report-receipt.json"
}

stage_static() { node "$OPS"/run-static-integrity-checks.js --output "${STAGE_DIR}/static-integrity-evidence-receipt.json"; }
stage_volume() { node "$OPS"/verify-volume-encryption.js --output "${STAGE_DIR}/volume-encryption-evidence-receipt.json"; }
stage_rotation() { bash "$OPS"/run-secret-rotation-drill.sh --dry-run --evidence-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/secret-rotation-evidence-receipt.json"; }
stage_capacity() { bash "$OPS"/run-capacity-alerting-drill.sh "${capacity_args[@]}" --evidence-dir "$STAGE_DIR" --evidence-file "${STAGE_DIR}/capacity-alerting-drill-evidence-receipt.json"; }

# Stage 1: static templates & container runtime integrity
run_stage "static_templates" "Templates, runtime, secret scan" \
  stage_static

# Stage 2: supply-chain SBOM & SAST security scanning
run_stage "supply_chain_sast" "SBOM, SAST, container security" \
  stage_supply_chain

# Stage 3: Caddy ingress routing & deployment rollback preflight
run_stage "ingress_deployment" "Caddy routing + deployment drill" \
  stage_ingress

# Stage 4: volume configuration/local-scan preflight (always simulation)
run_stage "volume_encryption" "Volume configuration preflight + local filename scan" \
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

# Stage 7: disaster recovery restore drill & reconciliation (simulation rehearsal).
# Runs an isolated local restore into acres_restore_drill and read-only reconciliation.
# Does not perform live production disaster recovery or verify off-host encryption.
run_stage "disaster_recovery" "Restore drill + reconciliation (simulation rehearsal)" \
  stage_disaster_recovery
END_MS="$(get_time_ms)" || fail 'Time source unavailable'
[[ "$END_MS" =~ ^[0-9]+$ ]] || fail 'Invalid time source'
DURATION_MS=$((END_MS - START_MS))
DURATION_S="$(node -e "console.log(($DURATION_MS/1000).toFixed(2))")"

TOTAL=${#STAGE_STATUS[@]}

ASSEMBLY_ARGS=("$TIMESTAMP" "$DURATION_S"
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_IDS[@]}")"
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_DESCS[@]}")"
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_STATUS[@]}")"
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1).map(Number)))' "${STAGE_MS[@]}")"
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_ERRORS[@]}")"
  "$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "${STAGE_ARTIFACTS[@]}")"
  "$CADDYFILE" "$COMPOSE_FILE" "$TARGET_URL" "$API_URL" "$ALLOW_HSTS" "$DRY_RUN" "$START_MS" "$END_MS" "$RUN_DIR")
node "$OPS"/assemble-launch-dossier.js assemble "$OUTPUT_PATH" "${ASSEMBLY_ARGS[@]}" >"$VIEW_PATH" 2>/dev/null || fail 'Dossier assembly or publication failed'
VERDICT="$(node "$ASSEMBLER" verify "$OUTPUT_PATH" "$VIEW_PATH" "${ASSEMBLY_ARGS[@]}" 2>/dev/null)" || fail 'Dossier verification failed'
[[ "$VERDICT" =~ ^(PASSED|FAILED)\ ([0-7])$ ]] || fail 'Incomplete dossier verdict'
OVERALL="${BASH_REMATCH[1]}"; PASSED="${BASH_REMATCH[2]}"
FAILED=$((TOTAL - PASSED))
DOSSIER_JSON=""
if ((JSON_OUT)); then DOSSIER_JSON="$(cat -- "$VIEW_PATH" 2>/dev/null)" || fail 'Dossier snapshot unavailable'; fi
release_resources || fail 'Owned publication cleanup failed'

printf '%s\n' '-----------------------------------------------------------------'
printf 'Stages passed: %d/%d  |  failed: %d  |  duration: %s s\n' "$PASSED" "$TOTAL" "$FAILED" "$DURATION_S"
printf 'Dossier: %s\n' "$OUTPUT_PATH"
printf '%s\n' '-----------------------------------------------------------------'

if [ "$JSON_OUT" -eq 1 ]; then
  printf '%s\n' "$DOSSIER_JSON"
fi

if [ "$OVERALL" = "PASSED" ]; then
  printf 'Overall Result: PASSED. All 7 drill stages satisfied. Operator production sign-off remains separate.\n\n'
  exit 0
else
  printf 'Overall Result: FAILED. %d stage(s) failed — see dossier.\n\n' "$FAILED"
  exit 1
fi
