#!/usr/bin/env bash
set -euo pipefail
# Offline repository assertions, or a separately authorized bounded login exercise.
error() { printf 'Error: %s\n' "$1" >&2; exit 1; }
SCRIPT_DIR="$(dirname -- "${BASH_SOURCE[0]}" 2>/dev/null)" || error 'Installation directory unavailable'
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." 2>/dev/null && pwd -P)" || error 'Installation directory unavailable'
TARGET_CWD="$ROOT_DIR"
DRY_RUN=0
EVIDENCE_DIR=backups
EVIDENCE_FILE=""
API_URL="${API_URL-http://localhost:3001}"
declare -A SEEN=()
while (($#)); do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --cwd|--cwd=*|--evidence-dir|--evidence-dir=*|--evidence-file|--evidence-file=*|--api-url|--api-url=*)
      opt="${1%%=*}"
      [[ -z "${SEEN[$opt]:-}" ]] || error 'Repeated value option'
      if [[ "$1" == *=* ]]; then val="${1#*=}"; shift
      else
        (($# >= 2)) && [[ "$2" != -* ]] || error 'Value option requires a non-empty value'
        val="$2"; shift 2
      fi
      [[ "$val" =~ [^[:space:]] ]] || error 'Value option requires a non-empty value'
      SEEN[$opt]=1
      case "$opt" in
        --cwd) TARGET_CWD="$val" ;;
        --evidence-dir) EVIDENCE_DIR="$val" ;;
        --evidence-file) EVIDENCE_FILE="$val" ;;
        --api-url) API_URL="$val" ;;
      esac ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/ops/run-dos-resilience-drill.sh [options]
Value options accept separate and attached = forms, once each.
  --cwd <dir>               Static source cwd (default: installation repository root)
  --dry-run                 Offline repository checks; zero network requests
  --evidence-dir <dir>      Evidence directory (default: backups, relative to target cwd)
  --evidence-file <file>    Absent exact JSON destination; overrides evidence-dir
  --api-url <origin>        HTTP(S) API origin (default: http://localhost:3001)
  --help, -h                Show help
Without --dry-run this performs a live exercise requiring separate operator authorization.
HELP
      exit 0 ;;
    *) error 'Unknown option or unexpected positional argument' ;;
  esac
done
[[ -d "$TARGET_CWD" && -r "$TARGET_CWD" && -x "$TARGET_CWD" ]] || error 'Invalid cwd directory'
TARGET_CWD="$(cd -- "$TARGET_CWD" 2>/dev/null && pwd -P)" || error 'Invalid cwd directory'
cd -- "$TARGET_CWD" 2>/dev/null || error 'Invalid cwd directory'
for tool in node dirname mkdir mktemp ln rm; do
  command -v "$tool" >/dev/null 2>&1 || error "Required utility unavailable: $tool"
done
if (( ! DRY_RUN )); then
  command -v curl >/dev/null 2>&1 || error 'Required utility unavailable: curl'
fi
[[ -f "$ROOT_DIR/scripts/ops/launch-target-evidence.js" && -r "$ROOT_DIR/scripts/ops/launch-target-evidence.js" ]] || error 'Required local helper unavailable'
export DOS_HELPER="$ROOT_DIR/scripts/ops/launch-target-evidence.js"
# Silence arbitrary runtime diagnostics; report only controlled errors at shell boundaries.
API_URL="$(node - "$API_URL" 2>/dev/null <<'NODE'
try {
  const {safeUrl} = require(process.env.DOS_HELPER);
  const raw=process.argv[2];
  const url = new URL(safeUrl(raw));
  if (!raw.trim() || url.pathname !== '/' || /[?#]/.test(raw)) throw Error();
  process.stdout.write(url.origin);
} catch { process.exit(1); }
NODE
)" || error 'API URL must be a safe HTTP(S) origin'
node - "$EVIDENCE_DIR" "$EVIDENCE_FILE" 2>/dev/null <<'NODE' || error 'Evidence destination exists or output parent is unavailable'
const fs=require('node:fs'), path=require('node:path');
try {
  const [dir,file]=process.argv.slice(2);
  if(file) {
    if(file.endsWith(path.sep)) throw Error();
    try { fs.lstatSync(file); throw Error(); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  let parent=path.resolve(file?path.dirname(file):dir);
  while(true) {
    try {
      if(!fs.statSync(parent).isDirectory()) throw Error();
      fs.accessSync(parent,fs.constants.W_OK|fs.constants.X_OK); break;
    } catch(e) {
      if(e.code!=='ENOENT') throw e;
      try { fs.lstatSync(parent); throw Error(); }
      catch(l) { if(l.code!=='ENOENT') throw l; }
      parent=path.dirname(parent);
    }
  }
} catch { process.exit(1); }
NODE
START_TIME_MS="$(node -e 'process.stdout.write(String(Date.now()))' 2>/dev/null)" || error 'Clock unavailable'
umask 077
PRIVATE_DIR=""
PUBLISH_TMP=""
release() {
  local failed=0
  if [[ -n "$PRIVATE_DIR" ]]; then
    rm -rf -- "$PRIVATE_DIR" 2>/dev/null || failed=1
    if (( ! failed )); then PRIVATE_DIR=""; fi
  fi
  if [[ -n "$PUBLISH_TMP" ]]; then
    if rm -f -- "$PUBLISH_TMP" 2>/dev/null; then PUBLISH_TMP=""; else failed=1; fi
  fi
  return "$failed"
}
cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  release || { printf 'Error: Private resource cleanup failed\n' >&2; status=1; }
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
PRIVATE_DIR="$(mktemp -d 2>/dev/null)" || error 'Private temporary directory unavailable'
if [[ -z "$EVIDENCE_FILE" ]]; then
  UUID="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())' 2>/dev/null)" || error 'Evidence identifier unavailable'
  [[ -n "$UUID" ]] || error 'Evidence identifier unavailable'
  EVIDENCE_FILE="${EVIDENCE_DIR}/dos-resilience-evidence-${UUID}.json"
fi
[[ "$EVIDENCE_FILE" == /* ]] || EVIDENCE_FILE="$TARGET_CWD/$EVIDENCE_FILE"
EVIDENCE_PARENT="$(dirname -- "$EVIDENCE_FILE" 2>/dev/null)" || error 'Evidence parent unavailable'
mkdir -p -- "$EVIDENCE_PARENT" 2>/dev/null || error 'Could not create evidence parent'
FAILURES=()
fail() { FAILURES+=("$1"); printf 'Failed: %s\n' "$1" >&2; }
STATIC_JSON="$(node 2>/dev/null <<'NODE'
const fs = require('node:fs');
const has = (file, patterns) => {
  try { const text = fs.readFileSync(file, 'utf8'); return patterns.every(p => p.test(text)); }
  catch { return false; }
};
const env = 'server/src/config/env.validation.ts';
const layers = {
  layer1_edge_ingress: {passed: has('infra/caddy/Caddyfile.example', [
    /max_size.*ACRES_MAX_REQUEST_BODY/, /read_timeout.*ACRES_API_READ_TIMEOUT/,
    /write_timeout.*ACRES_API_WRITE_TIMEOUT/, /dial_timeout.*ACRES_API_DIAL_TIMEOUT/])},
  layer2_in_process_throttling: {passed:
    has(env, [/RATE_LIMIT_DEFAULT_LIMIT/, /RATE_LIMIT_STRICT_LIMIT/]) &&
    has('server/src/security/security.module.ts', [/AcresThrottlerGuard/]) &&
    ['auth/auth', 'forms/forms'].every(p => has(`server/src/${p}.controller.ts`, [/@StrictThrottle\(\)/])) &&
    ['health/health', 'metrics/metrics'].every(p => has(`server/src/${p}.controller.ts`, [/@SkipThrottle\(\)/])) &&
    has('server/src/common/api-exception.filter.ts', [/TOO_MANY_REQUESTS.*'RATE_LIMITED'/])},
  layer3_graphql_bounds: {passed:
    has('server/src/app.setup.ts', [/express.json.*graphqlMaxBytes/]) &&
    has('server/src/graphql/graphql-limits.ts', [/graphqlMaxDepth/, /graphqlMaxAliases/,
      /graphqlMaxCost/, /graphqlMaxNodes/, /operationCount !== 1/])},
  layer4_storage_bounds: {passed: has(env, [/UPLOAD_MAX_BYTES/, /52428800/, /CLAMAV_HOST/, /STORAGE_BUCKET.*quarantine/])},
  layer5_anti_enumeration: {passed: has('server/src/auth/auth.service.ts', [/dummy-password-check/])},
};
process.stdout.write(JSON.stringify(layers));
NODE
)" || error 'Static evaluation unavailable'
if ! node -e 'process.exit(Object.values(JSON.parse(process.argv[1])).every(l=>l.passed===true)?0:1)' "$STATIC_JSON" 2>/dev/null; then
  fail 'Repository protection assertions failed'
fi
MODE=simulated
BURST_MODE=skipped
BURST_PASSED=null
ATTEMPTED=0
THROTTLED=0
AUTH_REJECTED=0
UNEXPECTED=0
TRANSPORT=0
PRE=false
CSRF=false
POST=false
# All curl calls ignore ambient .curlrc, have bounded time/body, and never follow redirects.
request() {
  if ! STATUS="$(curl -q --silent --connect-timeout 2 --max-time 5 --max-filesize 65536 \
      --output "$PRIVATE_DIR/body" --write-out '%{http_code}' "$@" 2>/dev/null)"; then
    return 1
  fi
  [[ "$STATUS" =~ ^[1-5][0-9][0-9]$ ]]
}
health() {
  request "$API_URL/health" && [ "$STATUS" = 200 ] && node - "$PRIVATE_DIR/body" 2>/dev/null <<'NODE'
const {readBoundedJson} = require(process.env.DOS_HELPER);
try {
  const b=readBoundedJson(process.argv[2]);
  process.exit(b.ok===true && !Object.hasOwn(b,'error') && b.data?.status==='ok' && b.data?.service==='acres-api' &&
    Number.isFinite(b.data?.uptimeSeconds) && b.data.uptimeSeconds>=0 ? 0 : 1);
} catch { process.exit(1); }
NODE
}
if [ "$DRY_RUN" -eq 1 ]; then
  : # Emit the offline summary only after publication and cleanup succeed.
else
  MODE=live
  BURST_MODE=live
  BURST_PASSED=false
  if [ "${#FAILURES[@]}" -eq 0 ]; then
    if health; then PRE=true; else fail 'Pre-burst Acres health probe failed'; fi
  fi
  if [ "$PRE" = true ]; then
    if request --cookie-jar "$PRIVATE_DIR/cookies" --cookie "$PRIVATE_DIR/cookies" "$API_URL/api/v1/auth/csrf" &&
       [ "$STATUS" = 200 ] && node - "$PRIVATE_DIR/body" "$PRIVATE_DIR/headers" "$PRIVATE_DIR/cookies" "$API_URL" 2>/dev/null <<'NODE'
const fs=require('node:fs');
const {readBoundedJson}=require(process.env.DOS_HELPER);
try {
  const b=readBoundedJson(process.argv[2]);
  const token=b.data?.csrfToken;
  if(b.ok!==true || Object.hasOwn(b,'error') || b.data?.headerName!=='x-csrf-token' || typeof token!=='string' ||
      token.length===0 || token.length>8192 || /[\x00-\x20\x7f]/.test(token)) throw Error();
  const host=new URL(process.argv[5]).hostname;
  const cookies=fs.readFileSync(process.argv[4],'utf8').split('\n');
  if(!cookies.some(line => {
    const c=line.replace(/^#HttpOnly_/, '').split('\t');
    return c.length===7 && c[0]===host && c[2]==='/' && c[5] && c[6];
  })) throw Error();
  fs.writeFileSync(process.argv[3], `Content-Type: application/json\nx-csrf-token: ${token}\n`, {mode:0o600});
} catch { process.exit(1); }
NODE
    then CSRF=true; else fail 'CSRF handshake failed'; fi
  fi
  if [ "$CSRF" = true ]; then
    for ((i=0; i<15; i++)); do
      ATTEMPTED=$((ATTEMPTED+1))
      if ! request --cookie "$PRIVATE_DIR/cookies" --cookie-jar "$PRIVATE_DIR/cookies" \
          --header "@$PRIVATE_DIR/headers" --request POST \
          --data '{"email":"probe@acres.local","password":"bad-password"}' "$API_URL/api/v1/auth/login"; then
        TRANSPORT=$((TRANSPORT+1)); fail 'Login transport or status failure'; break
      fi
      if CODE="$(node - "$PRIVATE_DIR/body" "$STATUS" 2>/dev/null <<'NODE'
const {readBoundedJson}=require(process.env.DOS_HELPER);
try {
  const b=readBoundedJson(process.argv[2]);
  const expected=process.argv[3]==='401'?'INVALID_CREDENTIALS':process.argv[3]==='429'?'RATE_LIMITED':null;
  if(!expected || b.ok!==false || Object.hasOwn(b,'data') || b.error?.code!==expected || typeof b.error?.message!=='string' || !b.error.message) throw Error();
  process.stdout.write(expected);
} catch { process.exit(1); }
NODE
)"; then
        if [ "$CODE" = RATE_LIMITED ]; then THROTTLED=$((THROTTLED+1)); else AUTH_REJECTED=$((AUTH_REJECTED+1)); fi
      else
        UNEXPECTED=$((UNEXPECTED+1)); fail 'Unexpected login response'; break
      fi
    done
    # Stop on unexpected traffic; do not issue further requests to a suspect target.
    if [ "${#FAILURES[@]}" -eq 0 ]; then
      if health; then POST=true; else fail 'Post-burst Acres health probe failed'; fi
      if [ "$THROTTLED" -eq 0 ]; then fail 'No validated throttle within 15 requests'; fi
    fi
  fi
  if [ "${#FAILURES[@]}" -eq 0 ]; then BURST_PASSED=true; fi
fi
FAILURES_JSON="$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "${FAILURES[@]}" 2>/dev/null)" || error 'Evidence serialization failed'
PUBLISH_TMP="$(mktemp "$EVIDENCE_PARENT/.dos-evidence.XXXXXXXX" 2>/dev/null)" || error 'Temporary evidence unavailable'
if ! node - "$PUBLISH_TMP" "$START_TIME_MS" "$MODE" "$API_URL" "$STATIC_JSON" \
    "$BURST_MODE" "$BURST_PASSED" "$ATTEMPTED" "$THROTTLED" "$AUTH_REJECTED" \
    "$UNEXPECTED" "$TRANSPORT" "$PRE" "$CSRF" "$POST" "$FAILURES_JSON" 2>/dev/null <<'NODE'
const fs=require('node:fs');
const {targetId}=require(process.env.DOS_HELPER);
const [file,start,mode,origin,staticRaw,burstTestMode,passed,attempted,throttled,auth,unexpected,transport,pre,csrf,post,failuresRaw]=process.argv.slice(2);
const failures=JSON.parse(failuresRaw);
const evidence={timestamp:new Date().toISOString(),durationMs:Date.now()-Number(start),
  drill_type:'dos_resilience_drill',status:failures.length?'failed':'success',mode,
  apiTargetId:mode==='live'?targetId(origin):null,
  layers:{...JSON.parse(staticRaw),layer6_rate_limiter_burst:{
    burstTestMode,passed:JSON.parse(passed),attemptedRequests:Number(attempted),
    throttledRequests:Number(throttled),authRejectedRequests:Number(auth),
    unexpectedResponses:Number(unexpected),transportFailures:Number(transport),
    preHealthPassed:pre==='true',csrfHandshakePassed:csrf==='true',postHealthPassed:post==='true',
  }},failures};
try { fs.writeFileSync(file,JSON.stringify(evidence,null,2)); }
catch { console.error('Evidence publication failed'); process.exit(1); }
NODE
then error 'Evidence serialization failed'; fi
# Independent completeness check: a serializer that exits early cannot publish partial JSON.
node - "$PUBLISH_TMP" "$MODE" "$FAILURES_JSON" "$STATIC_JSON" "$API_URL" "$START_TIME_MS" \
    "$BURST_MODE" "$BURST_PASSED" "$ATTEMPTED" "$THROTTLED" "$AUTH_REJECTED" \
    "$UNEXPECTED" "$TRANSPORT" "$PRE" "$CSRF" "$POST" 2>/dev/null <<'NODE' || error 'Evidence serialization failed'
try {
  const {readBoundedJson,targetId}=require(process.env.DOS_HELPER);
  const e=readBoundedJson(process.argv[2]);
  const failures=JSON.parse(process.argv[4]), layers=JSON.parse(process.argv[5]);
  const [origin,start,burstTestMode,passed,attempted,throttled,auth,unexpected,transport,pre,csrf,post]=process.argv.slice(6);
  const expectedBurst={burstTestMode,passed:JSON.parse(passed),attemptedRequests:Number(attempted),
    throttledRequests:Number(throttled),authRejectedRequests:Number(auth),
    unexpectedResponses:Number(unexpected),transportFailures:Number(transport),
    preHealthPassed:pre==='true',csrfHandshakePassed:csrf==='true',postHealthPassed:post==='true'};
  const sampled=Date.parse(e.timestamp), now=Date.now();
  if(e.drill_type!=='dos_resilience_drill' || e.mode!==process.argv[3] ||
      e.status!==(failures.length?'failed':'success') ||
      JSON.stringify(e.failures)!==JSON.stringify(failures) ||
      !Number.isSafeInteger(e.durationMs) || e.durationMs<0 ||
      typeof e.timestamp!=='string' || !Number.isFinite(sampled) ||
      new Date(sampled).toISOString()!==e.timestamp || sampled<Number(start) || sampled>now ||
      e.durationMs>now-Number(start) ||
      e.apiTargetId!==(e.mode==='live'?targetId(origin):null) ||
      Object.keys(e.layers).length!==6 ||
      JSON.stringify(e.layers.layer6_rate_limiter_burst)!==JSON.stringify(expectedBurst) ||
      Object.keys(layers).some(k=>e.layers[k]?.passed!==layers[k].passed)) throw Error();
} catch { process.exit(1); }
NODE
# -T prevents a concurrently inserted directory from redirecting the hard link.
ln -T -- "$PUBLISH_TMP" "$EVIDENCE_FILE" 2>/dev/null || error 'Evidence publication failed'
release || error 'Private resource cleanup failed'
if [ "${#FAILURES[@]}" -gt 0 ]; then exit 1; fi
if [ "$DRY_RUN" -eq 1 ]; then echo 'Offline repository checks. Live rate limiting was not exercised.';
else echo 'Passed: repository assertions and bounded login throttle/health observation'; fi
